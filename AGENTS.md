# tool-hub 开发约定

- 项目名称保持 `tool-hub`，界面使用简体中文。
- 实施范围、界面和验收以 `docs/phase-1-spec.md` 为准；资金模型以 `docs/calculation-rules.md` 为准。
- 按 `src/features/<tool>/` 组织业务；首页与路由使用统一工具注册配置。
- 计算规则独立于 React、图表、存储与系统时钟。金额使用 decimal.js 独立实例，64 位精度、ROUND_HALF_UP；禁止用浮点数计算金额。
- 编辑输入与成功结果快照分开；图表、表格、汇总、CSV 消费同一份结果。
- 每个修复增加能验证真实边界的必要测试；不为静态文案和低风险样式堆积测试。
- 交付前运行 `npm run check`、`npm run test` 和 `npm run build`，并记录实际执行的界面验证；修改界面主要流程后运行 `npm run test:browser`。
- 更新 `docs/implementation-plan.md` 的完成状态；影响模型或业务边界的决策记录在 `docs/decisions.md`。
- 不自行扩展到收支规划业务、按月测算、真实保险产品建模、后端、账户或桌面版。
- 每次修改在 `docs/changes.md` 写明变化、原因与验证结果，并同步相关需求、计算与决策文档。
- 用户已要求今后的修改提交到 GitHub：验证通过后将代码和文档一并提交并推送 origin；不要发布站点。
- 不提交密钥、个人测算记录、依赖目录或构建产物；数据文件保存在用户选择的项目外文件夹。
