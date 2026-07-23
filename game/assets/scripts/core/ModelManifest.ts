/**
 * 物件 id -> glb 预制体子资源 uuid，仅作 PrefabCache 的**兜底**：
 * 正常路径加载（models/<id>/<id>）失败时才用。
 *
 * 注意：这份表是手工维护的历史产物（原注释提到的 scripts/gen_manifest.py 已不存在）。
 * 新增模型**不必**登记——basket_redwood / bowl_jade 都不在表内且路径加载正常。
 * 若真机构建出现路径加载失败，再把对应 uuid（见 <model>.glb.meta 的 subMetas）补进来。
 */
export const MODEL_PREFAB_UUID: Record<string, string> = {
    baicai: '3b67ff3a-fbff-4dd5-bc23-f71757a9dbc5@d8820',
    banzhi: '6a42c322-ea5c-48f7-9fd8-08e633b1d929@63c27',
    bracelet: 'ac6876d0-1eaa-425a-9859-d2251403e912@858f2',
    goose: '7c43be91-cccc-4976-b9ee-4422807168ec@438ee',
    hulu: '2c80e844-c110-422e-8b97-50c13e042c0f@8c7e8',
    mile: 'f1ceb582-e409-4952-b02a-62aefe13804e@c3dab',
    pingankou: '881785d5-2ec1-4f38-9c6b-e8c668ace3a0@16ff8',
    pixiu: 'b3f7bbe5-f2c9-4eb8-bf78-5f4c62f68ad3@ccca3',
    tongqian: 'f92603ee-7571-477c-95bb-70f79e9d4a36@7e87c',
    yupai: '7f36cfae-5ae0-4e3b-a1f7-15d264652682@da8aa',
    yuzhuo: '6e2e06ba-498c-40f0-a81d-e74e2dd7f8c5@51ccb',
};
