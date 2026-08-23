# 3D 模型质量升级 v2 规范

本文把苹果 v2 的已验证流程固化为后续模型的统一交付标准。目标不是承诺模型永远不会出错，
而是通过可重复的生成、严格门禁和可回滚提交，让问题在进入正式资源前被发现并阻断。

苹果基准提交：`3d1de65 feat: 重建苹果 3D 模型`。

## 一、适用范围

本轮优先覆盖除水果主题外的 26 个独立模型：

| 主题 | 数量 | 模型 |
| --- | ---: | --- |
| 古玩铺 | 8 | `tongqian`、`bracelet`、`baoshi`、`hulu`、`yuzhuo`、`banzhi`、`yuxi`、`ruyi` |
| 池塘农场 | 9 | `carrot`、`corn`、`eggplant`、`frog`、`pumpkin`、`mushroom`、`koi`、`lotus`、`duck` |
| 甜品小镇 | 9 | `cupcake`、`donut`、`icecream`、`macaron`、`cookie`、`cake_slice`、`candy`、`pudding`、`croissant` |

共享角色 `goose` 和水果主题剩余 8 件单独排期，不计入上述 26 件，避免角色级重建与普通道具
混用同一预算和验收口径。

## 二、不可跳过的原则

1. **一模型一规格、一验收、一提交。** 默认不把多个重建模型塞进同一 commit；失败时必须能
   单独回滚。
2. **先证据，后建模。** 没有参考图评估、质量契约和严格规格，不开始改正式 GLB。
3. **先候选，后替换。** 候选模型通过 Blender 三角度检查后，才能覆盖
   `game/assets/resources/models/<id>.glb`。
4. **只生成目标模型。** 单件优化必须使用生成脚本的模型过滤参数，禁止顺手覆盖同主题其他资源。
5. **视觉判断不能被自动分数替代。** 自动校验通过但固定机位仍有球体感、穿插、黑块或语义误读，
   一律判定失败。
6. **运行时证据是最终事实。** Blender 中好看但在 Cocos 堆叠、随机旋转或手机尺寸下不可辨识，
   不能交付。

## 三、标准目录结构

每个模型都使用同一结构，`<theme>` 为 `antique`、`farm` 或 `dessert`：

```text
design/<theme>-theme/<model>-v2/
├── <model>-concept-sheet-v1.png
├── <model>-hero-reference-v1.png
├── <model>-assessment.json
├── <model>-sculpt-spec.json
├── detail-inventory.json
├── detail-crops/
└── reference-pbr/                 # 只有材质确实使用时才保留

audit/model-quality/<model>-v2/
├── before/<model>.png
├── after/<model>.png
├── side/<model>.png
├── back/<model>.png
├── before-after.png
└── in-game/<model>-gameplay.png
```

正式资源仍位于：

```text
game/assets/resources/models/<model>.glb
game/assets/resources/models/<model>.glb.meta
```

不提交 `.DS_Store`、`game/build/`、`game/library/`、`game/temp/`、Blender 临时文件或未被
最终模型使用的失败贴图。

## 四、逐模型执行流程

### 0. 建立基线

- 记录当前分支、工作区状态和目标 GLB 大小。
- 用统一相机渲染旧模型到 `before/`，记录三角面、材质数和归一化包围盒。
- 写清当前最影响游戏识别的 1～3 个问题，例如“俯视像圆球”“叶片是平面卡片”。
- 工作区有用户已有改动时，只操作目标模型，不清理或覆盖无关文件。

### 1. 参考图和质量契约

- 使用原创参考图或确认可使用的来源图；至少包含一个能看清主体轮廓、连接关系和材质响应的
  三分之四视角。
- 按 `img2threejs` 流程完成图像适用性评估、宏观/中观/微观拆解和细节清单。
- `assessment.json` 必须写出 `qualityContract`：目标用途、复杂度、关键识别特征、允许近似项、
  性能预算和停止条件。
- 单张参考看不到的背面或底部必须标记为推断，不能伪装成精确还原。

### 2. 严格雕刻规格

- 每个语义部件都要有名称、拓扑类别、尺寸关系、材质、父子连接和验收特征。
- 枝、叶、把手、肢体等附属件必须定义父级连接点、嵌入深度或重叠量，禁止悬空拼接。
- 连续有机主体优先使用连续变形网格；不能用多个球体拼接来冒充完整体块。
- 详细对象必须把 `detailInventory` 的每项映射到真实几何或材质实现，不能只写在说明里。
- 在生成模型前执行：

```bash
python3 /Users/xmly/.agents/skills/img2threejs/forge/stage2_spec/validate_sculpt_spec.py \
  design/<theme>-theme/<model>-v2/<model>-sculpt-spec.json --strict-quality
```

结果不是 `PASS` 时停止，不进入建模。

### 3. 分阶段建模

按以下顺序迭代，每一阶段只解决当前层级的问题：

1. `blockout`：主体比例、重心和最大轮廓。
2. `structure`：语义部件、连接关系、空洞和层级。
3. `form`：肩部、收底、折面、边缘厚度等中尺度形体。
4. `material`：基础色、粗糙度、金属度、法线和 AO；各 PBR 通道不得互相冒充。
5. `detail`：只增加手机画面中实际可读的纹理、刻痕、叶脉或装饰。
6. `optimization`：删除不可见面和无贡献细节，保持命名与结构不变。

程序噪声必须固定随机种子。若后台生成贴图写出纯黑、纯白或尺寸异常，立即阻断导出；可先退回
稳定纯材质，但不能把坏贴图嵌入 GLB。苹果 v2 的黑色临时贴图就是此规则的来源。

### 4. Blender 固定机位验收

正式替换前必须得到三个非退化视角：

```bash
<blender-4.5> --background --python scripts/render_model_audit.py -- \
  --output audit/model-quality/<model>-v2/after --only <model>

<blender-4.5> --background --python scripts/render_model_audit.py -- \
  --output audit/model-quality/<model>-v2/side --only <model> --azimuth 112

<blender-4.5> --background --python scripts/render_model_audit.py -- \
  --output audit/model-quality/<model>-v2/back --only <model> --azimuth 232
```

三图必须同时满足：

- 主轮廓比旧版明显改善，且关键特征在游戏近俯视角可读。
- 没有悬浮、穿插、破面、法线翻转、黑块、平面卡片或只对单一镜头成立的假体积。
- 部件连接有真实接触量；背面不是空壳；底部不会导致明显悬空。
- 固定机位前后对比由 `make_comparison_sheet.py` 生成并人工复核。

### 5. 性能与资源门禁

| 项目 | 普通道具 | 角色/复杂主体 |
| --- | ---: | ---: |
| 三角面建议上限 | 4,000 | 8,500 |
| 材质建议上限 | 8 | 10 |
| 单张纹理建议上限 | 512×512 | 1024×1024，必须说明理由 |
| 最大边 | 归一化为 1.0 | 归一化为 1.0 |

超预算不是自动否决，但必须在审计文档中说明“增加了哪些手机可见特征、为何不能再减”。相较旧版
三角面增长超过 50% 时，必须提供前后对比证明新增面数确实改善轮廓或连接，而不是隐藏细分。

### 6. Cocos 导入门禁

1. 使用 Cocos Creator 3.8.8 打开当前 `game/` 工程，等待目标 GLB 导入完成。
2. 目标 `.glb.meta` 的顶层 UUID 必须保持不变，避免资源引用失效。
3. `subMetas` 中的 Mesh 数、材质数和三角面必须与 Blender 审计一致。
4. 导入后执行 `git status --short`。只允许目标 GLB 和目标 `.meta` 变化；Cocos 自动刷新的其他
   模型元数据必须排除，不得混入提交。
5. 运行：

```bash
./tools/check.sh
./tools/build-web.sh
```

构建必须同时满足：任务输出 `Finished`、`jolt-glue.js` 存在、玩法脚本不是空壳、无 source map、
发布目录不超过既有体积门禁。Creator 的外部 SSL 握手日志不能替代资源错误判断；如果脚本返回非零，
必须定位具体错误并完成全部产物门禁，不能只看目录存在就放行。

### 7. 游戏内最终验收

至少在 390×844 等效手机视口完成一次真实关卡检查：

- 进入对应主题，确认运行时实际加载新模型，而不是旧构建缓存。
- 模型在随机旋转、堆叠遮挡和主题灯光下仍能辨识。
- 点击、碰撞、消除、槽位图标和冻结状态不受影响。
- 浏览器控制台 0 个资源加载错误、0 个运行时错误。
- 保存完整游戏截图到 `in-game/`，截图中必须能明确指出目标模型。

缺少游戏内截图即视为未完成；Blender 渲染不能替代运行时证据。

### 8. 提交与回滚

- 提交前执行 `git diff --check`、`./tools/check.sh`，逐项检查暂存文件。
- 默认提交内容只包含：目标 GLB/`.meta`、生成代码、规格、必要参考资产、固定机位证据和审计记录。
- 推荐提交信息：`feat: 重建 <中文名> 3D 模型`。
- 任一验收失败时不提交正式资源；保留候选与失败原因，选择
  `refine-spec`、`refine-code`、`request-input` 或 `stop` 之一继续处理。
- 已提交后发现运行时回归，按单模型 commit 回滚，不连带撤销其他模型。

## 五、单模型完成定义（Definition of Done）

以下项目必须全部勾选：

- [ ] 有旧版固定机位基线和明确问题描述。
- [ ] 有合法可用的参考图、评估文件、细节清单和质量契约。
- [ ] 雕刻规格通过 `--strict-quality`。
- [ ] 主体、附属件和材质均由确定性脚本可重复生成。
- [ ] 正面、侧面、背面三个视角通过人工视觉检查。
- [ ] 三角面、材质、纹理、归一化和部件命名满足预算。
- [ ] Cocos 保持顶层 UUID，导入结构与 Blender 一致。
- [ ] `./tools/check.sh` 通过，Web 构建产物门禁通过。
- [ ] 真实游戏内可辨识，点击/碰撞/槽位正常，控制台零错误。
- [ ] 有前后对比、游戏内截图和审计记录。
- [ ] 暂存区不含其他模型、缓存或 `.DS_Store`。
- [ ] 使用独立 commit 提交，可单独回滚。

任一项未完成，模型状态只能是“进行中”，不能标记为“已优化”。

## 六、26 模型跟踪表

状态只使用：`待评估`、`规格中`、`建模中`、`运行时验收`、`已完成`、`阻塞`。

| 序号 | 主题 | 模型 | 状态 | 提交 |
| ---: | --- | --- | --- | --- |
| 1 | 古玩铺 | `tongqian` | 已完成 | 本提交 |
| 2 | 古玩铺 | `bracelet` | 已完成 | `2f2d6fc` |
| 3 | 古玩铺 | `baoshi` | 已完成 | `9764769` |
| 4 | 古玩铺 | `hulu` | 运行时验收 | 本提交 |
| 5 | 古玩铺 | `yuzhuo` | 待评估 | — |
| 6 | 古玩铺 | `banzhi` | 待评估 | — |
| 7 | 古玩铺 | `yuxi` | 待评估 | — |
| 8 | 古玩铺 | `ruyi` | 待评估 | — |
| 9 | 池塘农场 | `carrot` | 待评估 | — |
| 10 | 池塘农场 | `corn` | 待评估 | — |
| 11 | 池塘农场 | `eggplant` | 待评估 | — |
| 12 | 池塘农场 | `frog` | 待评估 | — |
| 13 | 池塘农场 | `pumpkin` | 待评估 | — |
| 14 | 池塘农场 | `mushroom` | 待评估 | — |
| 15 | 池塘农场 | `koi` | 待评估 | — |
| 16 | 池塘农场 | `lotus` | 待评估 | — |
| 17 | 池塘农场 | `duck` | 待评估 | — |
| 18 | 甜品小镇 | `cupcake` | 待评估 | — |
| 19 | 甜品小镇 | `donut` | 待评估 | — |
| 20 | 甜品小镇 | `icecream` | 待评估 | — |
| 21 | 甜品小镇 | `macaron` | 待评估 | — |
| 22 | 甜品小镇 | `cookie` | 待评估 | — |
| 23 | 甜品小镇 | `cake_slice` | 待评估 | — |
| 24 | 甜品小镇 | `candy` | 待评估 | — |
| 25 | 甜品小镇 | `pudding` | 待评估 | — |
| 26 | 甜品小镇 | `croissant` | 待评估 | — |

每完成一件，必须同时更新状态、commit 和 `audit/model-quality/README.md`，让列表、证据与代码
始终保持一致。
