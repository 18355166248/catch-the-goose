def recipe($dominant; $secondary; $class): {
  dominantAlbedo: $dominant,
  secondaryAlbedo: $secondary,
  materialClass: $class,
  materialClassConfidence: 0.88,
  colorGradient: {type:"radial",stops:[{position:0,color:$dominant},{position:1,color:$secondary}]}
};

def pbr: {
  usable:true, confidence:0.86, estimatedFidelity:0.86, targetThreshold:0.7,
  sourceImage:"design/antique-theme/tongqian-v2/tongqian-concept-sheet-v1.png",
  maps:{
    albedo:{path:"design/antique-theme/tongqian-v2/reference-pbr/bronze/bronze_albedo.png",url:"bronze_albedo.png"},
    roughness:{path:"design/antique-theme/tongqian-v2/reference-pbr/bronze/bronze_roughness.png",url:"bronze_roughness.png"},
    height:{path:"design/antique-theme/tongqian-v2/reference-pbr/bronze/bronze_height.png",url:"bronze_height.png"},
    normal:{path:"design/antique-theme/tongqian-v2/reference-pbr/bronze/bronze_normal.png",url:"bronze_normal.png"},
    ao:{path:"design/antique-theme/tongqian-v2/reference-pbr/bronze/bronze_ao.png",url:"bronze_ao.png"}
  }
};

. as $spec
| .preSpecAssessment.objectClass = {
    primaryType:"ancient-cash-coin", primaryDomain:"object",
    formLanguage:["radial","low-relief","beveled","hand-forged"],
    structureKind:["layered-disc","true-through-hole","repeated-relief"],
    motionPotential:["rigid-body","flat-spin"],
    materialFamilies:["aged-bronze","copper-patina"],
    notes:"A rigid flat collectible whose identity is the circular silhouette, square negative space, raised rims, and four-way relief system."
  }
| .preSpecAssessment.complexity.scores = {
    silhouetteComplexity:0.55, componentCount:0.62, hierarchyDepth:0.45,
    repetitionDensity:0.66, materialLayerCount:0.48, localDetailDensity:0.64,
    occlusionRisk:0.32, actionReadinessNeed:0.35
  }
| .preSpecAssessment.complexity.estimatedCounts = {
    macroComponents:3, mesoComponents:4, microFeatureGroups:2,
    materialLayers:2, repetitionSystems:2
  }
| .preSpecAssessment.specDepthDecision.needsRepetitionSystems = true
| .preSpecAssessment.specDepthDecision.needsMaterialLocalOverrides = true
| .preSpecAssessment.unknownsToResolveBeforeImplementation = []
| .preSpecAssessment.detailInventory.details = [
    {id:"square-through-hole",kind:"negative-space",description:"True square opening with softly beveled corners",region:{x:0.35,y:0.31,width:0.25,height:0.29,units:"normalized"},scale:"macro",affects:"silhouette and topology",mapsTo:{type:"component.localFeatures",ref:"coin-body:square-through-hole"},evidenceRef:"hero-full",confidence:0.98},
    {id:"raised-outer-rim",kind:"ridge",description:"Broad raised circular rim with worn highlight",region:{x:0.04,y:0.06,width:0.68,height:0.8,units:"normalized"},scale:"meso",affects:"form and highlight",mapsTo:{type:"component.localFeatures",ref:"outer-rim:beveled-rim"},evidenceRef:"hero-full",confidence:0.96},
    {id:"raised-square-rim",kind:"ridge",description:"Raised frame surrounding the square hole",region:{x:0.32,y:0.28,width:0.31,height:0.36,units:"normalized"},scale:"meso",affects:"form and cavity shading",mapsTo:{type:"component.localFeatures",ref:"inner-rim:square-frame"},evidenceRef:"hero-full",confidence:0.97},
    {id:"four-glyph-relief",kind:"raised-relief",description:"Four broad pseudo-seal motifs arranged around the hole",region:{x:0.12,y:0.12,width:0.76,height:0.7,units:"normalized"},scale:"meso",affects:"identity and grazing highlight",mapsTo:{type:"component.localFeatures",ref:"glyph-system:four-way-relief"},evidenceRef:"front-view",confidence:0.94},
    {id:"recessed-field",kind:"recess",description:"Shallow darker field between both raised rims",region:{x:0.16,y:0.17,width:0.62,height:0.62,units:"normalized"},scale:"meso",affects:"depth and AO",mapsTo:{type:"material.localOverrides",ref:"bronze:field-darkening"},evidenceRef:"front-view",confidence:0.92},
    {id:"patina-cavities",kind:"stain",description:"Sparse green patina restrained to deep contacts",region:{x:0.15,y:0.16,width:0.65,height:0.65,units:"normalized"},scale:"micro",affects:"albedo and roughness",mapsTo:{type:"material.localOverrides",ref:"bronze:patina-cavities"},evidenceRef:"hero-full",confidence:0.82},
    {id:"worn-high-edges",kind:"edge-wear",description:"Golden wear on outer, square, and glyph high edges",region:{x:0.05,y:0.06,width:0.78,height:0.78,units:"normalized"},scale:"micro",affects:"albedo and roughness",mapsTo:{type:"material.localOverrides",ref:"bronze:worn-high-edges"},evidenceRef:"hero-full",confidence:0.9}
  ]
| .viewEvidence = [
    {id:"hero-full",view:"three-quarter",imageRegion:{x:0,y:0,width:0.67,height:1,units:"normalized"},observations:["flat round disc","open square hole","raised double rims","aged bronze relief"],confidence:0.96},
    {id:"front-view",view:"front",imageRegion:{x:0.62,y:0.08,width:0.36,height:0.5,units:"normalized"},observations:["four-way glyph layout","square negative space","radial proportions"],confidence:0.97},
    {id:"side-view",view:"side",imageRegion:{x:0.58,y:0.55,width:0.4,height:0.34,units:"normalized"},observations:["disc thickness","beveled outer edge","relief height"],confidence:0.94},
    {id:"game-audit",view:"fixed-game-camera",imageRegion:{x:0,y:0,width:1,height:1,units:"normalized"},observations:["mobile near-top readability"],confidence:1.0}
  ]
| ($spec.componentTree[0]) as $base
| .componentTree = [
    ($base | .id="root" | .name="Cash Coin Assembly" | .role="container" | .level="macro" | .primitive="plane-card" | .topologyClass="material-only" | .topologyRationale="Invisible runtime container for separately named structural meshes." | .material="utility" | .materialLayers=["utility"] | .localFeatures=[] | .colorMaterialRecipe=recipe("rgba(0,0,0,0)";"rgba(0,0,0,0)";"utility") | .evidenceRefs=["hero-full"]),
    ($base | .id="coin-body" | .name="Flat annular coin body" | .role="body" | .level="macro" | .parent="root" | .primitive="extrude" | .topologyClass="continuous-sculpt" | .topologyRationale="A continuous flat disc contains a genuine square through-hole and beveled outer/inner walls." | .material="bronze" | .materialLayers=["bronze"] | .dimensions={width:1,height:1,depth:0.09,units:"relative",confidence:0.96} | .localFeatures=[{id:"square-through-hole",type:"negative-space",placement:"center",size:0.31,orientation:"axis aligned",geometryEffect:"true open square tunnel with rounded bevel",materialEffect:"dark cavity walls",confidence:0.98},{id:"hand-forged-edge",type:"deformation",placement:"outer circumference",size:0.008,orientation:"deterministic radial",geometryEffect:"subtle irregular rim silhouette",materialEffect:"none",confidence:0.78}] | .surfaceDetail={macroRoughness:0.04,microRoughness:0.05,bumpAmplitude:0.002,normalPattern:"restrained hammer grain",displacementPattern:"none",occlusionPattern:"square tunnel and relief contacts",edgeWearPattern:"outer bevel and high relief",notes:"The disc stays flat; no funnel or bowl deformation."} | .colorMaterialRecipe=recipe("rgba(120,76,34,1)";"rgba(181,128,65,1)";"aged-bronze") | .evidenceRefs=["hero-full","front-view","side-view"]),
    ($base | .id="outer-rim" | .name="Raised circular outer rim" | .role="rim" | .level="macro" | .parent="root" | .primitive="torus" | .topologyClass="continuous-sculpt" | .topologyRationale="The broad annular rim is continuous raised geometry that defines the outer highlight and thickness." | .material="bronze" | .materialLayers=["bronze"] | .dimensions={width:1,height:1,depth:0.12,units:"relative",confidence:0.96} | .localFeatures=[{id:"beveled-rim",type:"bevel",placement:"outer and inner rim edges",size:0.025,orientation:"radial",geometryEffect:"two soft bevel bands",materialEffect:"worn gold edge",confidence:0.96}] | .colorMaterialRecipe=recipe("rgba(159,101,40,1)";"rgba(205,151,73,1)";"aged-bronze") | .evidenceRefs=["hero-full","side-view"]),
    ($base | .id="inner-rim" | .name="Raised square inner rim" | .role="rim" | .level="macro" | .parent="root" | .primitive="extrude" | .topologyClass="assembled-solid" | .topologyRationale="Four beveled frame rails surround the square opening while leaving the tunnel fully open." | .material="bronze" | .materialLayers=["bronze"] | .dimensions={width:0.42,height:0.42,depth:0.13,units:"relative",confidence:0.97} | .localFeatures=[{id:"square-frame",type:"ridge",placement:"around square hole",size:0.055,orientation:"axis aligned",geometryEffect:"raised four-sided beveled frame",materialEffect:"worn high edge",confidence:0.97}] | .colorMaterialRecipe=recipe("rgba(169,105,40,1)";"rgba(214,159,77,1)";"aged-bronze") | .evidenceRefs=["hero-full","front-view","side-view"]),
    ($base | .id="glyph-system" | .name="Four-way seal relief system" | .role="ornament" | .level="macro" | .parent="root" | .primitive="tube" | .topologyClass="surface-relief" | .topologyRationale="Four broad original glyph-like paths are raised relief with enough height to catch grazing light." | .material="bronze" | .materialLayers=["bronze"] | .dimensions={width:0.74,height:0.74,depth:0.13,units:"relative",confidence:0.93} | .localFeatures=[{id:"four-way-relief",type:"raised-relief",placement:"cardinal zones around hole",size:0.19,orientation:"radial/cardinal",geometryEffect:"rounded rectangular strokes raised above field",materialEffect:"bright worn ridge and dark contact AO",confidence:0.94}] | .colorMaterialRecipe=recipe("rgba(168,105,40,1)";"rgba(218,160,76,1)";"aged-bronze") | .evidenceRefs=["hero-full","front-view"]),
    ($base | .id="recessed-field" | .name="Recessed bronze field" | .role="surface-relief" | .level="meso" | .parent="coin-body" | .primitive="cylinder" | .topologyClass="surface-relief" | .topologyRationale="A shallow field sits below both rims and relief motifs without changing the outer silhouette." | .material="dark-bronze" | .materialLayers=["bronze","patina"] | .localFeatures=[] | .colorMaterialRecipe=recipe("rgba(76,52,30,1)";"rgba(119,78,40,1)";"aged-bronze") | .evidenceRefs=["hero-full","front-view"]),
    ($base | .id="outer-bevel" | .name="Outer bevel band" | .role="surface-relief" | .level="meso" | .parent="outer-rim" | .primitive="torus" | .topologyClass="surface-relief" | .topologyRationale="The rounded bevel controls the silhouette highlight at the disc perimeter." | .material="bronze" | .materialLayers=["bronze"] | .localFeatures=[] | .colorMaterialRecipe=recipe("rgba(205,151,73,1)";"rgba(159,101,40,1)";"aged-bronze") | .evidenceRefs=["hero-full","side-view"]),
    ($base | .id="square-tunnel" | .name="Square tunnel walls" | .role="surface-relief" | .level="meso" | .parent="coin-body" | .primitive="extrude" | .topologyClass="assembled-solid" | .topologyRationale="Four continuous inner walls prove the square opening is a through-hole rather than a dark decal." | .material="dark-bronze" | .materialLayers=["bronze"] | .localFeatures=[] | .colorMaterialRecipe=recipe("rgba(55,36,20,1)";"rgba(101,63,31,1)";"aged-bronze") | .evidenceRefs=["hero-full","side-view"]),
    ($base | .id="relief-strokes" | .name="Rounded glyph strokes" | .role="surface-relief" | .level="meso" | .parent="glyph-system" | .primitive="tube" | .topologyClass="surface-relief" | .topologyRationale="Rounded stroke geometry carries the identity motif and remains readable under mobile grazing light." | .material="bronze" | .materialLayers=["bronze"] | .localFeatures=[] | .colorMaterialRecipe=recipe("rgba(183,119,45,1)";"rgba(221,165,82,1)";"aged-bronze") | .evidenceRefs=["front-view"])
  ]
| ($spec.materials[0]) as $mat
| .materials = [
    ($mat | .id="utility" | .name="Invisible utility" | .baseColor="#000000" | .color="#000000" | .qualityTier="utility"),
    ($mat | .id="bronze" | .name="Worn raised bronze" | .baseColor="#A76B2D" | .color="#A76B2D" | .albedo={dominant:"#A76B2D",secondary:["#CD9749","#785022","#593F23"],samplingNotes:"Warm worn bronze sampled from raised rims and relief; exclude studio background."} | .colorVariation={palette:["#593F23","#83582E","#B58047","#DAC5A6"],pattern:"dark recess to golden high edge",amplitude:0.18,heightCorrelation:0.72} | .roughness={base:0.48,variation:0.17,map:"reference-pbr/bronze/bronze_roughness.png",localResponse:"worn high edges smoother; recessed field and patina rougher"} | .metalness=0.78 | .normal={pattern:"reference-pbr/bronze/bronze_normal.png",strength:0.18,scale:34,space:"tangent"} | .bump={pattern:"restrained hammer grain",amplitude:0.002,scale:48} | .ambientOcclusion={map:"reference-pbr/bronze/bronze_ao.png",cavityStrength:0.35,contactShadowBias:0.28,notes:"Concentrate at square tunnel, rim roots, and glyph contacts."} | .localOverrides=[{id:"field-darkening",region:"recessed face field",color:"#593F23",roughness:0.66,strength:0.55,evidenceRefs:["hero-full","front-view"]},{id:"patina-cavities",region:"sparse deep contacts only",color:"#3E6B58",roughness:0.8,strength:0.12,evidenceRefs:["hero-full"]},{id:"worn-high-edges",region:"outer rim, square rim, glyph ridges",color:"#D5A052",roughness:0.32,strength:0.48,evidenceRefs:["hero-full","front-view"]}] | .referencePbr=pbr),
    ($mat | .id="dark-bronze" | .name="Recessed aged bronze" | .baseColor="#593F23" | .color="#593F23" | .albedo={dominant:"#593F23",secondary:["#2B1F0E","#83582E","#3E6B58"],samplingNotes:"Dark face field and tunnel walls."} | .roughness={base:0.68,variation:0.12,map:"reference-pbr/bronze/bronze_roughness.png",localResponse:"patina and tunnel walls stay matte"} | .metalness=0.62 | .normal={pattern:"reference-pbr/bronze/bronze_normal.png",strength:0.12,scale:40,space:"tangent"} | .ambientOcclusion={map:"reference-pbr/bronze/bronze_ao.png",cavityStrength:0.4,contactShadowBias:0.25,notes:"Preserve true negative space; do not paint the square hole black."} | .localOverrides=[{id:"patina-cavities",region:"glyph and rim roots",color:"#3E6B58",roughness:0.82,strength:0.14,evidenceRefs:["hero-full"]}] | .referencePbr=pbr)
  ]
| .repetitionSystems = [
    {id:"four-glyph-cardinal",type:"radial-array",count:4,componentRef:"glyph-system",distribution:"cardinal positions around square hole",geometry:{reliefHeight:0.035,strokeWidth:0.035},buildsGeometry:true,evidenceRefs:["front-view"]},
    {id:"edge-wear-system",type:"height-correlated-material-mask",count:3,componentRef:"root",distribution:"outer rim, inner rim, glyph relief",realization:"material override",buildsGeometry:false,evidenceRefs:["hero-full","front-view"]}
  ]
| .featureReviewTargets = [
    {id:"disc-square-silhouette",name:"Flat circular disc and true square negative space",tier:"critical",passIds:["blockout","form-refinement"],minimumScore:0.88,mustPass:true,componentRefs:["coin-body","square-tunnel"],evidenceRefs:["hero-full","front-view","side-view"]},
    {id:"double-rim-depth",name:"Raised circular and square rim hierarchy",tier:"critical",passIds:["structural-pass","form-refinement"],minimumScore:0.85,mustPass:true,componentRefs:["outer-rim","inner-rim"],evidenceRefs:["hero-full","side-view"]},
    {id:"four-glyph-identity",name:"Four-way broad seal relief system",tier:"critical",passIds:["structural-pass","surface-pass"],minimumScore:0.83,mustPass:true,componentRefs:["glyph-system","relief-strokes"],evidenceRefs:["front-view"]},
    {id:"aged-bronze-response",name:"Satin bronze, dark recess and restrained patina",tier:"critical",passIds:["material-pass","lighting-pass"],minimumScore:0.82,mustPass:true,componentRefs:["coin-body","outer-rim","inner-rim","glyph-system"],evidenceRefs:["hero-full"]},
    {id:"game-camera-readability",name:"Mobile fixed-camera coin readability",tier:"critical",passIds:["optimization-pass"],minimumScore:0.84,mustPass:true,componentRefs:["root","coin-body","outer-rim","inner-rim","glyph-system"],evidenceRefs:["game-audit"]}
  ]
| .lightingFromPhoto = [
    "key light: broad warm area light from camera upper-left, medium-soft contact shadow, AgX medium-high contrast",
    "fill light: cool low-intensity camera-right fill to preserve square tunnel and relief separation",
    "rim/environment: restrained warm rear rim and neutral environment reflection; no mirror-gold washout"
  ]
| .qualityTargets.targetFidelity = 0.86
| .qualityTargets.reviewViewpoints = ["fixed-game-three-quarter","front","side"]
| .performanceBudget = {qualityPriority:"mobile silhouette and relief readability",targetTriangles:2800,maxTriangles:4000,maxDrawCalls:5,textureSize:512,fpsTarget:60,optimizationPolicy:"Preserve open square topology, double rims and four relief motifs; simplify hidden underside micro grain first."}
| .referenceCamera = {solved:true,type:"orthographic game-like",fovDegrees:40,aspect:0.695,orientation:{yaw:-20,pitch:32,roll:0},positionHint:[1.65,-2.25,2.8],note:"Project audit camera is final authority; concept sheet supplies form evidence rather than exact projection."}
| .buildPasses |= map(.componentRefs=["root","coin-body","outer-rim","inner-rim","glyph-system","recessed-field","outer-bevel","square-tunnel","relief-strokes"])
| .risks = [
    "The concept motifs are original pseudo-seal shapes and must remain non-legible; they are identity relief, not historical text.",
    "The coin must remain flat for the existing ROUND_ITEMS/Jolt handling; no bowl deformation is allowed.",
    "Single-image PBR maps are evidence only; Cocos runtime lighting is the material authority."
  ]
| .preSpecAssessment.complexity.scores = {
    silhouetteComplexity:2, componentCount:2, hierarchyDepth:1,
    repetitionDensity:2, materialLayerCount:2, localDetailDensity:2,
    occlusionRisk:1, actionReadinessNeed:1
  }
| .preSpecAssessment.detailInventory.details |= map(
    if .id == "square-through-hole" then .kind="groove" | .mapsTo.ref="square-through-hole"
    elif .id == "raised-outer-rim" then .kind="ridge" | .mapsTo.ref="beveled-rim"
    elif .id == "raised-square-rim" then .kind="ridge" | .mapsTo.ref="square-frame"
    elif .id == "four-glyph-relief" then .kind="ridge" | .mapsTo.ref="four-way-relief"
    elif .id == "recessed-field" then .kind="groove" | .mapsTo.ref="field-darkening"
    elif .id == "patina-cavities" then .kind="stain" | .mapsTo.ref="patina-cavities"
    elif .id == "worn-high-edges" then .kind="stain" | .mapsTo.ref="worn-high-edges"
    else . end
  )
| .componentTree |= map(
    .colorMaterialRecipe.materialClass = (if .id == "root" then "unknown" else "metal" end)
    | if .parent != null then .attachment = {
        parentId:.parent, parentSocket:(.parent + "-surface"),
        localStart:[0,0,0], localEnd:[0,0,0.04], contactType:"overlap",
        overlap:0.025, gapTolerance:0.01, evidenceRefs:["hero-full","side-view"]
      } else . end
  )
| .componentTree |= map(if .id == "recessed-field" then .materialLayers=["bronze","dark-bronze"] else . end)
| .lightingFromPhoto += ["exposure: 0.0; tone mapping: AgX Medium High Contrast; transparent audit background with coherent contact shadow"]
