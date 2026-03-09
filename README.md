# LoomPlus MeetingBot Recipe

这是一个基于 **ClawChef + OpenClaw** 的 recipe，用来快速安装一个可运行的 Telegram 会议助手工作区。

它会自动完成：

- 创建 OpenClaw workspace 和 agent
- 写入会议助手需要的配置与脚本模板
- 配置 Telegram channel 账号
- 提供 unit / integration / recipe smoke 测试

适合你用来：

- 快速启动一个可用的会议机器人
- 作为团队内部 recipe 模板二次开发
- 在 CI 里做自动化回归验证

## 安装（使用 ClawChef）

前置要求：

- Node.js >= 22
- 已安装 `openclaw`
- 已安装 `clawchef`

推荐先使用 `.env` 管理参数（避免每次手动输入 `--var`）：

```bash
cp .env.example .env
```

然后编辑 `.env`，至少填好以下必填项：

- `CLAWCHEF_VAR_TELEGRAM_BOT_TOKEN_LOOMPLUS`
- `CLAWCHEF_VAR_LOOMPLUS_MCP_ACCESS_TOKEN`
- 以及你选择的模型密钥（例如 `CLAWCHEF_VAR_OPENAI_API_KEY`）

先校验 recipe：

```bash
clawchef validate src/recipe.yaml
```

执行安装（从 `.env` 读取参数）：

```bash
clawchef cook src/recipe.yaml
```

如果你更喜欢命令行显式传参，也可以继续使用 `--var`。

安装完成后会创建：

- workspace（默认：`workspace-meeting`）
- agent（默认：`loomplus-meeting`）

## 参数说明

参数定义在 `src/recipe.yaml` 的 `params` 下。最常用参数：

- `telegram_bot_token_loomplus`（必填）：Telegram Bot Token
- `loomplus_mcp_access_token`（必填）：LoomPlus MCP 访问令牌
- `auth_choice`：模型鉴权方式（默认 `openai-api-key`）
- `openai_api_key` / `anthropic_api_key` / `openrouter_api_key`：按鉴权方式提供
- `openclaw_version`：OpenClaw 版本（默认 `2026.2.9`）
- `project_name` / `agent_name` / `agent_model`：工作区与 agent 基本配置

在 `.env` 里建议使用 `CLAWCHEF_VAR_<PARAM_NAME>` 命名，例如：

- `CLAWCHEF_VAR_AUTH_CHOICE`
- `CLAWCHEF_VAR_OPENAI_API_KEY`
- `CLAWCHEF_VAR_TELEGRAM_BOT_TOKEN_LOOMPLUS`
- `CLAWCHEF_VAR_LOOMPLUS_MCP_ACCESS_TOKEN`

示例（自定义工作区和模型）：

```bash
clawchef cook src/recipe.yaml \
  --var "project_name=my-meeting-workspace" \
  --var "agent_name=my-meeting-bot" \
  --var "agent_model=anthropic/claude-opus-4-6" \
  --var "auth_choice=openai-api-key" \
  --var "openai_api_key=<KEY>" \
  --var "telegram_bot_token_loomplus=<TOKEN>" \
  --var "loomplus_mcp_access_token=<TOKEN>"
```

## 开发与测试

安装依赖：

```bash
npm install
```

运行测试：

```bash
# 全量
npm test

# 单元测试
npm run test:unit

# 集成测试
npm run test:integration

# Recipe smoke（Telegram mock + pairing）
npm run test:recipe
```

### `test:recipe` 会验证什么

`tests/recipe/recipe-smoke.test.mjs` 会走完整关键链路：

1. `clawchef validate` + `clawchef cook`
2. 启动 `openclaw gateway`
3. 注入第一条 Telegram 消息，校验返回 pairing 文案（包含 `Pairing code`）
4. 自动执行 `openclaw pairing approve telegram <code>`
5. 再发消息问名字，校验回复包含目标名（如 `loomplus-meeting`）

## 常见问题

- `Missing Telegram mock CA cert`
  - 检查 `TELEGRAM_MOCK_CA_CERT`，默认路径：`/etc/telegram-mock/test-ca.crt`
- `Failed to enable telegram-api-mock-server mock mode`
  - 确认 mock server 已启动，且 admin 端点可访问
- Telegram channel 不可用
  - 先检查 `openclaw plugins list`；recipe 已包含 telegram plugin 启用步骤
