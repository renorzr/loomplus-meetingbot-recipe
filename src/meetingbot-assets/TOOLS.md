# TOOLS.md - MeetingBot

## LoomPlus MCP (via mcporter)
- Config: `config/mcporter.json`
- 环境变量: `MCPORTER_CONFIG=/root/.openclaw/workspace-meeting/config/mcporter.json`
- 默认时区: `Asia/Shanghai` (北京时间)

### 查邮箱（单个）
```bash
mcporter call loomplus.get_user_email_by_platform_id --args '{"platform":"tg","platformId":"123456"}'
```

### 批量查邮箱（按 platform ID）
```bash
mcporter call loomplus.get_user_emails_by_ids --args '{"platform":"tg","ids":["123456","789012"]}'
```
返回 `{ "123456": "a@x.com" }`，未绑定的 ID 不会出现在结果中。

### 绑定用户
```bash
mcporter call loomplus.bind_user_info --args '{"bindingCode":"abc123","platform":"tg","platformId":"123456"}'
```

### 创建会议（直接通过 MCP，自动含 Meet 链接 + 同步 LoomPlus）
```bash
mcporter call loomplus.create_google_meeting --args '{"summary":"会议主题","startTime":"2026-03-01T20:00:00","endTime":"2026-03-01T21:00:00","attendeeEmails":["a@x.com","b@x.com"],"timeZone":"Asia/Shanghai"}'
```

### 修改会议（按 meetingLink）
```bash
mcporter call loomplus.update_google_meeting_by_link --args '{"meetingLink":"https://meet.google.com/xxx","summary":"新标题","attendeeEmails":["a@x.com"]}'
```

### 删除会议（按 meetingLink）
```bash
mcporter call loomplus.delete_google_meeting_by_link --args '{"meetingLink":"https://meet.google.com/xxx"}'
```

### 知识库
```bash
mcporter call loomplus.list_knowledge_bases
mcporter call loomplus.get_knowledge_base_id --args '{"name":"KB名称"}'
mcporter call loomplus.upsert_document --args '{"kbId":"...","content":"...","source":"file.md"}'
```

## 项目管理（Task Board）

### 项目 CRUD
```bash
mcporter call loomplus.list_projects
mcporter call loomplus.get_project_id_by_name --args '{"name":"项目名"}'
mcporter call loomplus.create_project --args '{"name":"项目名","description":"描述"}'
mcporter call loomplus.update_project --args '{"projectId":"...","name":"新名","status":"IN_PROGRESS"}'
mcporter call loomplus.update_project_status --args '{"projectId":"...","status":"DONE"}'
mcporter call loomplus.delete_project --args '{"projectId":"..."}'
```

### 任务 CRUD
```bash
mcporter call loomplus.list_missions --args '{"projectId":"..."}'
mcporter call loomplus.get_mission --args '{"missionId":"..."}'
mcporter call loomplus.create_mission --args '{"projectId":"...","title":"任务名","description":"描述","assigneeId":"loom+userId"}'
mcporter call loomplus.create_mission_by_project_name --args '{"projectName":"项目名","title":"任务名"}'
mcporter call loomplus.update_mission --args '{"missionId":"...","status":"IN_PROGRESS","assigneeId":"..."}'
mcporter call loomplus.delete_mission --args '{"missionId":"..."}'
mcporter call loomplus.get_mission_logs --args '{"missionId":"..."}'
mcporter call loomplus.list_project_members --args '{"projectId":"..."}'
```                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 ### 任务状态枚举                                                                                                                                                                                                                                                                                                                                                                          UNASSIGNED | IN_PROGRESS | BLOCKED | DONE | CANCELLED                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               ### 注意                                                                                                                                                                                                                                                                                                                                                                                  - assigneeId 是 loom+ 内部 userId（通过 get_user_email_by_platform_id 的返回值获取）                                                                                                                                                                                                                                                                                                      - 项目状态同样使用上述枚举                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          ## 已知群成员                                                                                                                                                                                                                                                                                                                                                                             | 名称 | Telegram ID | 邮箱 | loom+ userId |                                                                                                                                                                                                                                                                                                                                              |------|-------------|------|-------------|                                                                                                                                                                                                                                                                                                                                               | Kate | 6605627876 | kate.g@metis.io | cmm4he17z00065xzgwunq0mby |                                                                                                                                                                                                                                                                                                                       | Jumor | 1776272750 | min.z@metis.io | cmm1rf37200005xr7gwn5av6i |                                                                                                                                                                                                                                                                                                                       | Reno | 1557827523 | reno@p1xlabs.com | cmmaj9bi3000f5xx0xupzl4xv |                                                                                                                                                                                                                                                                                                                      | Steven Guo | 6268241668 | bg1eym@gmail.com | cmm96hd6s00295x4lfem696d7 |                                                                                                                                                                                                                                                                                                                | Daniel | 5693420826 | daniel.l@metis.io | cmm96zy2k002l5x4lrs0ip2k3 |                                                                                                                                                                                                                                                                                                                   | Julie | 1453170155 | julie.z@metis.io | cmm8usg2p001f5x4l1sm1g4c1 |                                                                                                                                                                                                                                                                                                                     | jim mao | 7281299466 | 未绑定 | — |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               ## Fireflies.ai (会议转录 + 纪要)                                                                                                                                                                                                                                                                                                                                                         - Config: `config/fireflies.json`                                                                                                                                                                                                                                                                                                                                                         - API Key: 存在 config/fireflies.json（勿外泄）                                                                                                                                                                                                                                                                                                                                           - 用户: reno@p1xlabs.com                                                                                                                                                                                                                                                                                                                                                                  - 脚本: `scripts/fireflies_minutes.mjs`                                                                                                                                                                                                                                                                                                                                                     - `--list` 列出所有转录                                                                                                                                                                                                                                                                                                                                                                   - `--id <id>` 生成指定会议纪要                                                                                                                                                                                                                                                                                                                                                            - 无参数：检查新转录并生成纪要                                                                                                                                                                                                                                                                                                                                                          - 状态文件: `memory/fireflies-state.json`（已处理的 transcript IDs）                                                                                                                                                                                                                                                                                                                      - 定时任务: 每小时检查新转录（cron job）
