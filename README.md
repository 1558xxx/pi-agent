<p align="center">
  <a href="https://pi.dev">
    <img alt="Pi 标志" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://www.npmjs.com/package/@earendil-works/pi-coding-agent"><img alt="npm" src="https://img.shields.io/npm/v/@earendil-works/pi-coding-agent?style=flat-square" /></a>
</p>

> 上游项目说明：新贡献者提交的 Issue 和 PR 默认会被自动关闭，维护者会每天审阅这些自动关闭的提交。详情请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

# Pi

Pi 是一个精简、可扩展的智能体运行框架，可以根据你的需要进行定制。

让 Pi 适应你的工作流程。你可以通过[扩展](packages/coding-agent/docs/extensions.md)、[技能](packages/coding-agent/docs/skills.md)、[提示词模板](packages/coding-agent/docs/prompt-templates.md)和[主题](packages/coding-agent/docs/themes.md)定制 Pi，将它们打包为 [Pi 扩展包](packages/coding-agent/docs/packages.md)，并通过 npm 或 Git 分享。

Pi 提供实用的默认能力，但没有内置子智能体和计划模式等功能。你可以让 Pi 帮你构建所需功能，也可以安装符合自己使用方式的扩展包。

你可以[交互式使用 Pi](packages/coding-agent/docs/usage.md)，通过[打印输出或 JSON 模式](packages/coding-agent/docs/cli.md)实现自动化，经由 [RPC](packages/coding-agent/docs/rpc.md)控制它，或者使用 [Pi TypeScript SDK](packages/coding-agent/docs/sdk.md)构建应用。[OpenClaw](https://github.com/OpenClaw/OpenClaw) 是一个实际集成案例。

## 快速开始

安装命令行工具：

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

在 Windows 上：

```shell
powershell -c "irm https://pi.dev/install.ps1 | iex"
```

安装程序会锁定所有依赖版本，之后可通过 `pi update` 更新 Pi。你也可以直接通过 npm 安装，但这种方式不会锁定传递依赖：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Pi 需要 Node.js 22.19 或更新版本。macOS、Linux 和 Windows 安装程序可以在需要时安装 Node.js。常规 npm 安装不需要运行依赖生命周期脚本。

进入你希望 Pi 工作的目录并启动：

```bash
cd /path/to/project
pi
```

如果使用内置支持的 AI 服务商，在 Pi 中运行 `/login`，连接订阅账户或配置 API 密钥，然后向 Pi 分配任务。

完整的配置与使用说明请参阅[文档](https://pi.dev/docs/latest)，也可以[访问 pi.dev](https://pi.dev)查看演示。

## 使用 Nix 运行

```bash
nix run github:earendil-works/pi/stable
```

`stable` 指向最新发布版本。使用 `nix profile add github:earendil-works/pi/stable` 安装，使用 `nix profile upgrade pi` 更新。如果需要固定版本，可使用 `github:earendil-works/pi/v1.0.0` 这样的发布标签；如需使用 `main` 分支中尚未发布的更改，可使用 `github:earendil-works/pi`。Nix 会从源码构建 Pi。

支持 Linux 和 macOS 上的 ARM64 与 x86-64 架构。使用 `nix build .` 或 `nix run .` 构建或运行当前检出的源码。

Nix 构建在离线环境中进行，因此随包附带的模型数据来自 `nix/model-catalog.json` 中固定的 pi.dev 模型目录版本。运行时，Pi 仍会像往常一样从 pi.dev 获取较新的目录数据并叠加使用。当固定的目录版本与源码不再匹配时，例如新增服务商或模型类型后，Nix 工作流会更新 `main` 分支中的版本记录。如需手动更新：

```bash
npm run update:model-catalog-pin
```

## 开发包

本单体仓库包含 Pi 命令行工具及其配套开发库。

| 开发包 | 说明 |
|---------|-------------|
| **[@earendil-works/chord](packages/chord)** | 面向跨进程应用的对象运行时，提供契约、文档、存储、链接、支持热重载的插件、HTTP、工作进程，以及 Web 和终端客户端 |
| **[@earendil-works/pi-telemetry](packages/telemetry)** | 与厂商无关的遥测契约、参考适配器、一致性测试和带类型的 Schema |
| **[@earendil-works/pi-ai](packages/ai)** | 统一的多服务商大语言模型 API，支持 OpenAI、Anthropic、Google 等 |
| **[@earendil-works/pi-durable](packages/durable)** | 支持持久执行的对话、任务和文档运行时 |
| **[@earendil-works/pi-agent-core](packages/agent)** | 支持工具调用和状态管理的智能体运行时 |
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | 交互式编程智能体命令行工具 |
| **[@earendil-works/pi-tui](packages/tui)** | 支持差分渲染的终端界面库 |

如需 Slack / 聊天自动化和工作流支持，请参阅 [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat)。

## 权限与容器化

Pi 没有内置用于限制文件系统、进程、网络或凭据访问的权限系统。默认情况下，它继承启动它的用户和进程所拥有的权限。

如果需要更严格的隔离边界，可以将 Pi 放在容器或沙箱中运行。[容器化文档](packages/coding-agent/docs/containerization.md)介绍了三种方案：

- **Gondolin 扩展**：将 `pi` 进程和服务商认证信息保留在宿主机上，把内置工具和 `!` 命令转发到本地 Linux 微型虚拟机中执行。
- **普通 Docker 容器**：将整个 `pi` 进程放入本地容器，提供简单隔离。
- **OpenShell**：将整个 `pi` 进程放入由策略控制的沙箱。

## 参与贡献

贡献指南请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)，项目专属规则请参阅 [AGENTS.md](AGENTS.md)，这些规则同时适用于开发者和智能体。Pi 的长期规划可在 [RFC 提案](https://rfc.earendil.com/keyword/pi)中查看。

## 开发

```bash
npm install --ignore-scripts  # Install all dependencies without running lifecycle scripts
npm run build         # Refresh model data, then build all packages
npm run build:offline # Rebuild using existing model data without network access
npm run check         # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run pi from sources (can be run from any directory)
```

### 在单体仓库之外使用本地开发包

将所有公共开发包构建为一套版本一致的本地构建产物：

```bash
npm run pack:packages -- --out .artifacts/pi-packages
```

这会在构建 `pi-ai` 之前刷新模型数据。如果已有完整模型数据，且希望避免网络访问，可添加 `--offline-model-data`。

然后配置外部项目，使其使用指定开发包，并从同一套构建产物中解析全部 Pi 依赖。默认使用 npm：

```bash
node scripts/use-local-packages.mjs \
  --manifest .artifacts/pi-packages/manifest.json \
  --consumer ../my-project \
  --package @earendil-works/pi-durable \
  --package @earendil-works/pi-agent-core
cd ../my-project
npm install --ignore-scripts
```

如果使用 pnpm，将 `--consumer` 指向工作区根目录：

```bash
node scripts/use-local-packages.mjs \
  --manifest .artifacts/pi-packages/manifest.json \
  --consumer ../my-project \
  --package @earendil-works/pi-agent-core \
  --package-manager pnpm
cd ../my-project
pnpm install --ignore-scripts
```

每个直接依赖都使用一个 `--package` 参数。该命令会更新使用方的 `package.json`，写入按内容寻址的本地 `file:` 引用。对于传递依赖覆盖，npm 项目写入 `package.json`，pnpm 项目写入 `pnpm-workspace.yaml`。在安装或更新使用方项目时，请保留构建产物目录。修改 Pi 源码后，需要重新运行打包与接入命令。

## 从发布版源码构建独立可执行文件

GitHub 发布版本包含带版本号的源码归档，其校验信息记录在该发布版本的 `SHA256SUMS` 文件中。解压归档后，运行官方独立可执行文件使用的同一构建脚本：

```bash
VERSION="<release-version>"
tar -xzf "pi-${VERSION}-source.tar.gz"
cd "pi-${VERSION}"
./scripts/build-binaries.sh --offline-model-data --platform linux-x64 --out "$PWD/out"
```

归档中包含发布版模型数据和原生预构建产物。`--offline-model-data` 会使用归档内的模型数据，不刷新服务商目录。脚本会安装依赖，并构建包含运行时资源的可执行文件；如果依赖已经准备好，可传入 `--skip-install`。

## 供应链安全加固

项目将 npm 依赖变更作为需要审查的代码变更处理。

- 外部直接依赖锁定为精确版本，内部工作区开发包继续使用版本范围。
- `.npmrc` 设置 `save-exact=true` 和 `min-release-age=2`，避免 npm 解析到当天刚发布的依赖版本。
- `package-lock.json` 是依赖版本的权威记录。除非设置 `PI_ALLOW_LOCKFILE_CHANGE=1`，否则提交前检查会阻止意外提交锁文件变更。
- `npm run check` 会验证直接依赖是否固定版本、原生 TypeScript 导入兼容性，以及生成的编程智能体安装锁文件。
- pi.dev 安装程序使用 `packages/coding-agent/install-lock/` 中的安装锁文件。该文件由根目录锁文件生成，用于固定传递依赖；npm 包本身不会固定传递依赖。
- 本地发布冒烟测试与 npm 发布使用相同的 tarball 打包器，npm 发布经过验证的归档，而非重新打包工作区目录。
- 本地发布安装、文档中的 npm 安装命令及 `pi update --self` 会在支持时使用 `--ignore-scripts`。
- CI 使用 `npm ci --ignore-scripts` 安装依赖，定时 GitHub 工作流运行 `npm audit --omit=dev` 和 `npm audit signatures --omit=dev`。
- 安装锁文件生成流程为依赖生命周期脚本设置了显式允许列表。新增包含生命周期脚本的依赖，在审查通过前无法通过检查。

## 分享你的开源编程智能体会话

如果你使用 Pi 或其他编程智能体参与开源工作，欢迎分享会话记录。

公开的开源会话数据包含真实任务、工具使用、失败和修复过程，相比简单的玩具基准，更有助于改进编程智能体。

详细说明请参阅[这篇 X 帖子](https://x.com/badlogicgames/status/2037811643774652911)。

如需发布会话，可使用 [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf)，并阅读其 README.md 了解配置方法。你需要准备 Hugging Face 账户、Hugging Face CLI 和 `pi-share-hf`。

你也可以观看[演示视频](https://x.com/badlogicgames/status/2041151967695634619)，了解上游作者如何发布 `pi-mono` 会话。

上游作者会定期在以下位置公开自己的 `pi-mono` 工作会话：

- [Hugging Face 上的 badlogicgames/pi-mono](https://huggingface.co/datasets/badlogicgames/pi-mono)

## 许可证

MIT

<p align="center">
  <a href="https://pi.dev">pi.dev</a> 域名由以下团队慷慨捐赠
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy 吉祥物" width="48" /><br />exe.dev</a>
</p>
