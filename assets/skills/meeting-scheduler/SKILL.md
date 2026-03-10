---
name: meeting-scheduler
description: 会议时间协调和自动创建系统，集成 Telegram inline buttons、Fireflies 会议纪要、LoomPlus MCP。支持群聊多人时段选择、自动取交集、创建 Google Meeting。Use when scheduling meetings, coordinating availability across participants, creating Google Meet links, or generating meeting minutes from Fireflies.ai transcripts.
---

# Meeting Scheduler

群聊多人会议时间协调系统。两阶段选时：召集人先选→参会人从召集人时段中选→自动取交集→创建 Google Meeting。

## 架构

```
┌─────────────┐    HTTP API     ┌──────────────────────┐   Telegram API
│  AI Agent   │ ──────────────> │ scheduling-callback   │ <──────────────> Telegram
│             │  POST /create   │ server (port 3456)    │   inline buttons
└─────────────┘                 └──────────────────────┘
                                        │
                                        ├── LoomPlus MCP (create meeting, lookup emails)
                                        └── memory/scheduling-sessions.json (state)
```

## 组件

### 1. 调度回调服务 (`scripts/scheduling-callback-server.mjs`)
- 长轮询 Telegram Bot API 处理 `callback_query`
- HTTP API: `POST /create` 创建调度会话, `GET /status/:id` 查询状态
- 自动创建 Google Meeting（通过 mcporter + LoomPlus MCP）

### 2. 调度 CLI (`scripts/scheduling.mjs`)
- 本地状态管理：create / toggle / submit / status / list / cleanup
- Agent 可用此脚本直接操作会话状态

### 3. Fireflies 会议纪要 (`scripts/fireflies_minutes.mjs`)
- `--list` 列出转录, `--id <id>` 生成纪要, 无参数检查新转录
- 需要 `FIREFLIES_API_KEY` 环境变量

### 4. 启动脚本 (`scripts/start-scheduling-server.sh`)
- 设置环境变量并启动回调服务

## 部署

### 环境变量
| 变量 | 说明 |
|------|------|
| `SCHEDULER_BOT_TOKEN` | Telegram Bot token（专用调度 bot） |
| `LOOMPLUS_BOT_TOKEN` | MeetingBot 主 token（群通知用） |
| `FIREFLIES_API_KEY` | Fireflies.ai API key |
| `MCPORTER_CONFIG` | mcporter 配置文件路径 |
| `PORT` | 回调服务端口（默认 3456） |

### 配置文件
1. 复制 `assets/mcporter.template.json` → `config/mcporter.json`，填入 LoomPlus MCP access token
2. 复制 `assets/fireflies.template.json` → `config/fireflies.json`，填入 API key
3. 编辑 `scripts/start-scheduling-server.sh` 填入实际 bot token

### systemd 安装
```bash
cp assets/scheduling-callback.service /etc/systemd/system/
# 编辑 ExecStart 路径
systemctl daemon-reload
systemctl enable --now scheduling-callback
```

## 发起调度

```bash
curl -s -X POST http://127.0.0.1:3456/create \
  -H 'Content-Type: application/json' \
  -d '{
    "topic": "周会",
    "organizer": {"tgId": "123", "name": "Reno"},
    "attendees": [{"tgId": "456", "name": "Kate"}],
    "chatId": "-100xxxxx",
    "days": 3,
    "duration": 60
  }'
```

## Callback Data 格式
- `st:<sessionId>:<slotIndex>` — 切换时段选择
- `ss:<sessionId>` — 提交选择

AI 收到 `st:` 或 `ss:` 回调时**不要自己处理**，回调服务会直接响应。

## 协议详情
See [references/scheduling-protocol.md](references/scheduling-protocol.md)
