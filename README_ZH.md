# ACS Switch

ACS Switch 是 [ACS Gateway](https://acsgw.top) 的桌面配置客户端，基于 [CC Switch](https://github.com/farion1231/cc-switch) 定制。它用于导入并切换不同编程工具的 ACS 配置，无需逐个编辑配置文件。

[接入文档](https://acsgw.top/config-guide) | [最新版本](https://github.com/lsy1770/acs-switch/releases/latest) | [English](README.md)

## 下载

- Windows x64：[下载安装包](https://github.com/lsy1770/acs-switch/releases/latest/download/ACS-Switch_3.19.2_x64-setup.exe)
- SHA-256：[下载校验文件](https://github.com/lsy1770/acs-switch/releases/latest/download/ACS-Switch_3.19.2_x64-setup.exe.sha256)

当前 Windows 安装包尚未进行代码签名，Windows SmartScreen 可能要求手动确认。

## 支持的工具

- Claude Code
- Codex
- Gemini CLI
- Grok Build
- OpenCode
- OpenClaw
- Hermes

ACS 管理的配置统一使用 `https://acsgw.top`，并按工具写入对应协议端点。

## 导入流程

1. 在 ACS Gateway 创建或选择一个启用状态的 API Key。
2. 点击“导入 ACS Switch”，选择编程工具和默认模型。
3. 在 ACS Switch 中确认导入，然后从桌面控制台切换配置。

导入链接只包含一个五分钟有效、使用一次即失效的令牌。五分钟限制仅针对导入令牌，不影响 API Key 的有效期；导入后的密钥仍由 ACS Gateway 中设置的状态和到期时间控制。

## 本地开发

需要 Node.js 20、pnpm、Rust 1.95，以及 Tauri 2 对应平台的原生依赖。

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm tauri build
```

## 上游与许可

ACS Switch 基于 [farion1231/cc-switch](https://github.com/farion1231/cc-switch) 开发，上游版权和 MIT 许可保留在 [LICENSE](LICENSE) 中。
