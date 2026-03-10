# 会议时间协调协议

## 架构
- **回调服务**: `http://127.0.0.1:3456` (systemd: scheduling-callback)
  - 直接通过 Telegram API 处理按钮点击，秒级响应
  - 状态文件: `memory/scheduling-sessions.json`
- **AI Agent**: 只负责发起调度和处理最终结果

## Callback Data 格式
- `st:<sessionId>:<slotIndex>` → 切换时段（由回调服务处理）
- `ss:<sessionId>` → 提交选择（由回调服务处理）

## AI 收到 st: 或 ss: 回调时
**不要自己处理！** 转发给回调服务：
```bash
curl -s -X POST http://127.0.0.1:3456/callback \
  -H 'Content-Type: application/json' \
  -d '{"data":"st:xxx:0","chatId":"123","messageId":"456","userId":"789"}'
```
然后回复 NO_REPLY。

## 发起新调度
AI 负责：
1. 运行 `node scripts/scheduling.mjs create ...` 创建会话
2. 给召集人发送 inline buttons
3. 后续按钮交互全由回调服务处理

## 调度完成
回调服务在所有人提交后写入触发文件：`memory/scheduling-done-<sessionId>.json`
AI 可通过 heartbeat 或 cron 检查该文件，然后：
1. 读取交集结果
2. 创建 Google Meeting
3. 通知群聊
4. 删除触发文件

## 注意
- 回调服务 systemd 名: scheduling-callback
- 端口: 3456
- Bot token 从 openclaw.json 读取
