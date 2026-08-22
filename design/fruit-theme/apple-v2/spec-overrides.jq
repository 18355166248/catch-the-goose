def recipe($dominant; $secondary; $class; $confidence): {
  dominantAlbedo: $dominant,
  secondaryAlbedo: $secondary,
  materialClass: $class,
  materialClassConfidence: $confidence,
  colorGradient: {
    type: "radial",
    stops: [
      {position: 0.0, color: $dominant},
      {position: 1.0, color: $secondary}
    ]
  }
};

def attached($parent; $socket; $start; $end; $contact; $overlap): {
  parentId: $parent,
  parentSocket: $socket,
  localStart: $start,
  localEnd: $end,
  contactType: $contact,
  overlap: $overlap,
  gapTolerance: 0.01,
  evidenceRefs: ["hero-full", "sheet-top"]
};

. as $spec
| .preSpecAssessment.unknownsToResolveBeforeImplementation = []
| .preSpecAssessment.detailInventory.details |= map(
    if .id == "crown-cavity" then .kind = "groove" | .mapsTo.ref = "crown-cavity"
    elif .id == "five-lobe-shoulder" then .kind = "contour" | .mapsTo.ref = "five-lobe-shoulder"
    elif .id == "five-point-base" then .kind = "contour" | .mapsTo.ref = "five-point-base"
    elif .id == "coral-blush" then .kind = "stain" | .mapsTo.ref = "coral-blush"
    elif .id == "waxy-highlight" then .kind = "gloss" | .mapsTo.ref = "broad-wax-highlight"
    elif .id == "lenticel-speckles" then .kind = "stain" | .mapsTo.ref = "lenticel-speckles"
    elif .id == "stem-taper-grain" then .kind = "linework" | .mapsTo.ref = "curved-taper-grain"
    elif .id == "leaf-fold-vein" then .kind = "ridge" | .mapsTo.ref = "fold-vein-tip"
    else . end
  )
| .viewEvidence = [
    {id:"hero-full", view:"three-quarter", imageRegion:{x:0,y:0,width:1,height:1,units:"normalized"}, observations:["upper-heavy tapered apple silhouette", "five-lobed crown cavity", "embedded stem and folded leaf", "crimson-coral waxy skin"], confidence:0.94},
    {id:"sheet-side", view:"side", imageRegion:{x:0.33,y:0,width:0.34,height:0.8,units:"normalized"}, observations:["lower-third taper", "stem lean", "leaf thickness"], confidence:0.87},
    {id:"sheet-top", view:"near-top", imageRegion:{x:0.66,y:0,width:0.34,height:0.8,units:"normalized"}, observations:["five-way crown depression", "radial shoulder lobes", "leaf overlap"], confidence:0.91},
    {id:"game-audit", view:"fixed-game-camera", imageRegion:{x:0,y:0,width:1,height:1,units:"normalized"}, observations:["near-top mobile readability under project lighting"], confidence:1.0}
  ]
| ($spec.componentTree[0]) as $base
| .componentTree = [
    ($base
      | .id = "root"
      | .name = "Apple Assembly"
      | .role = "container"
      | .level = "macro"
      | .primitive = "plane-card"
      | .topologyClass = "material-only"
      | .topologyRationale = "Invisible runtime container groups the separately named fruit body, stem, and leaf without carrying visible volume."
      | .material = "utility"
      | .materialLayers = ["utility"]
      | .evidenceRefs = ["hero-full"]
      | .localFeatures = []
    ),
    ($base
      | .id = "fruit-body"
      | .name = "Five-lobed fruit body"
      | .role = "body"
      | .level = "macro"
      | .parent = "root"
      | .primitive = "ellipsoid"
      | .topologyClass = "continuous-sculpt"
      | .topologyRationale = "The reference is one seamless organic volume with continuously changing width, five crown lobes, and a tapered lower third."
      | .geometryDescriptor.topologyIntent = "subdivision-ready organic deformed mesh with radial five-lobe field"
      | .geometryDescriptor.deformationStack = ["upper shoulder expansion", "five-lobe radial modulation", "deep crown depression", "lower-third taper", "shallow five-point base"]
      | .material = "skin"
      | .materialLayers = ["skin"]
      | .dimensions = {width:1.0,height:0.88,depth:0.94,units:"relative",confidence:0.91}
      | .attachment = null
      | .actionProfile.animationRole = "static-part"
      | .actionProfile.collider = {type:"sphere",offset:[0,0,-0.03],scale:[0.94,0.94,0.82],isTrigger:false,notes:"Gameplay uses the existing generated Jolt proxy from normalized render bounds."}
      | .localFeatures = [
          {id:"five-lobe-shoulder", type:"contour", placement:"upper 42% radial shell", size:0.055, orientation:"fivefold around Z", geometryEffect:"restrained radial expansion", materialEffect:"none", confidence:0.94},
          {id:"crown-cavity", type:"recessed groove", placement:"top center", size:0.28, orientation:"radial", geometryEffect:"concave Z depression strongest at center", materialEffect:"burgundy cavity roughness override", confidence:0.95},
          {id:"five-point-base", type:"contour", placement:"bottom 18%", size:0.08, orientation:"fivefold around Z", geometryEffect:"soft base feet and central indentation", materialEffect:"higher contact roughness", confidence:0.84},
          {id:"organic-asymmetry", type:"deformation", placement:"whole body", size:0.025, orientation:"deterministic phase offset", geometryEffect:"break perfect rotational symmetry", materialEffect:"none", confidence:0.8}
        ]
      | .surfaceDetail = {macroRoughness:0.08,microRoughness:0.045,bumpAmplitude:0.002,normalPattern:"sparse lenticel and subtle wax bloom",displacementPattern:"fivefold crown/base sculpt only",occlusionPattern:"crown cavity and stem socket",edgeWearPattern:"none",notes:"No protruding skin beads; micro detail must stay inside the silhouette."}
      | .colorMaterialRecipe = recipe("rgba(151, 30, 25, 1.0)"; "rgba(242, 103, 91, 1.0)"; "skin"; 0.86)
      | .evidenceRefs = ["hero-full", "sheet-side", "sheet-top"]
    ),
    ($base
      | .id = "stem"
      | .name = "Curved fruit stem"
      | .role = "stem"
      | .level = "macro"
      | .parent = "root"
      | .primitive = "tube"
      | .topologyClass = "fiber-strand"
      | .topologyRationale = "The stem is a thick elongated botanical strand following a curved centerline with visible taper."
      | .geometryDescriptor.topologyIntent = "faceted tapered tube along a cubic curve"
      | .material = "stem"
      | .materialLayers = ["stem"]
      | .dimensions = {width:0.12,height:0.34,depth:0.12,units:"relative",confidence:0.91}
      | .attachment = attached("root"; "crown-socket"; [0,0,0.31]; [0.04,0.01,0.62]; "embed"; 0.055)
      | .actionProfile.animationRole = "static-part"
      | .localFeatures = [
          {id:"curved-taper-grain",type:"linework",placement:"stem length",size:0.025,orientation:"longitudinal",geometryEffect:"tapered faceted tube with mild bend",materialEffect:"vertical brown variation and high roughness",confidence:0.93},
          {id:"faceted-cut-top",type:"bevel",placement:"distal stem end",size:0.06,orientation:"normal to stem tangent",geometryEffect:"beveled octagonal cut cap",materialEffect:"lighter cut wood",confidence:0.88}
        ]
      | .colorMaterialRecipe = recipe("rgba(90, 40, 22, 1.0)"; "rgba(166, 128, 83, 1.0)"; "wood"; 0.86)
      | .evidenceRefs = ["hero-full", "sheet-side", "sheet-top"]
    ),
    ($base
      | .id = "leaf"
      | .name = "Folded apple leaf"
      | .role = "leaf"
      | .level = "macro"
      | .parent = "root"
      | .primitive = "extrude"
      | .topologyClass = "conforming-shell"
      | .topologyRationale = "The leaf is a thin lens-shaped shell with its own thickness, a central fold, and a curled tapered tip."
      | .geometryDescriptor.topologyIntent = "thin bent leaf shell with beveled boundary"
      | .material = "leaf"
      | .materialLayers = ["leaf"]
      | .dimensions = {width:0.42,height:0.06,depth:0.2,units:"relative",confidence:0.9}
      | .attachment = attached("root"; "stem-base-socket"; [0.025,0,0.42]; [0.4,0.03,0.48]; "overlap"; 0.04)
      | .actionProfile.animationRole = "static-part"
      | .localFeatures = [
          {id:"fold-vein-tip",type:"ridge",placement:"leaf midrib",size:0.025,orientation:"base to tapered tip",geometryEffect:"central fold plus raised vein and curled tip",materialEffect:"lighter upper ridge",confidence:0.94},
          {id:"leaf-thickness-curl",type:"contour",placement:"leaf boundary",size:0.018,orientation:"perimeter",geometryEffect:"beveled thickness and downward tip curl",materialEffect:"darker underside",confidence:0.88}
        ]
      | .colorMaterialRecipe = recipe("rgba(129, 138, 56, 1.0)"; "rgba(164, 173, 96, 1.0)"; "skin"; 0.8)
      | .evidenceRefs = ["hero-full", "sheet-side", "sheet-top"]
    ),
    ($base | .id="crown-form" | .name="Crown cavity relief" | .role="surface-relief" | .level="meso" | .parent="fruit-body" | .primitive="ellipsoid" | .topologyClass="surface-relief" | .topologyRationale="A visible concave crown changes the near-top silhouette and must be sculpted into the body." | .material="skin" | .materialLayers=["skin"] | .actionProfile.animationRole="static-detail" | .localFeatures=[] | .colorMaterialRecipe=recipe("rgba(82, 24, 22, 1.0)";"rgba(151, 30, 25, 1.0)";"skin";0.86) | .evidenceRefs=["hero-full","sheet-top"]),
    ($base | .id="base-form" | .name="Five-point base relief" | .role="surface-relief" | .level="meso" | .parent="fruit-body" | .primitive="ellipsoid" | .topologyClass="surface-relief" | .topologyRationale="The lower contour ends in five shallow feet around a central indentation visible in the hero silhouette." | .material="skin" | .materialLayers=["skin"] | .actionProfile.animationRole="static-detail" | .localFeatures=[] | .colorMaterialRecipe=recipe("rgba(116, 20, 20, 1.0)";"rgba(151, 30, 25, 1.0)";"skin";0.8) | .evidenceRefs=["hero-full"]),
    ($base | .id="cut-top" | .name="Faceted distal cut" | .role="surface-relief" | .level="meso" | .parent="stem" | .primitive="ellipsoid" | .topologyClass="surface-relief" | .topologyRationale="The lighter faceted cap is a small relief surface at the distal end of the curved stem." | .material="stem" | .materialLayers=["stem"] | .actionProfile.animationRole="static-detail" | .localFeatures=[] | .colorMaterialRecipe=recipe("rgba(166, 128, 83, 1.0)";"rgba(90, 40, 22, 1.0)";"wood";0.82) | .evidenceRefs=["hero-full"]),
    ($base | .id="folded-blade" | .name="Folded blade surface" | .role="surface-relief" | .level="meso" | .parent="leaf" | .primitive="extrude" | .topologyClass="conforming-shell" | .topologyRationale="The visible leaf blade bends around the midrib and has real thickness rather than a flat card." | .material="leaf" | .materialLayers=["leaf"] | .actionProfile.animationRole="static-detail" | .localFeatures=[] | .colorMaterialRecipe=recipe("rgba(129, 138, 56, 1.0)";"rgba(164, 173, 96, 1.0)";"skin";0.8) | .evidenceRefs=["hero-full","sheet-top"]),
    ($base | .id="midrib" | .name="Central raised ridge" | .role="surface-relief" | .level="meso" | .parent="leaf" | .primitive="tube" | .topologyClass="surface-relief" | .topologyRationale="A raised central vein is broad enough to affect grazing-light form and the leaf fold." | .material="leaf" | .materialLayers=["leaf"] | .attachment=attached("leaf";"leaf-base";[0,0,0];[0.35,0,0];"overlap";0.02) | .actionProfile.animationRole="static-detail" | .localFeatures=[] | .colorMaterialRecipe=recipe("rgba(164, 173, 96, 1.0)";"rgba(129, 138, 56, 1.0)";"skin";0.78) | .evidenceRefs=["hero-full","sheet-top"])
  ]
| ($spec.materials[0]) as $mat
| .materials = [
    ($mat | .id="utility" | .name="Invisible container utility" | .qualityTier="utility" | .baseColor="#000000" | .color="#000000" | .notes="Non-rendering container material."),
    ($mat
      | .id="skin" | .name="Crimson waxy apple skin" | .baseColor="#971E19" | .color="#971E19"
      | .albedo={dominant:"#971E19",secondary:["#D22D26","#F2675B","#52261B"],samplingNotes:"Reference extraction confidence 0.86; neutral midtone remains crimson while shoulders carry restrained coral and the crown deepens to burgundy."}
      | .colorVariation={palette:["#971E19","#D22D26","#F2675B","#52261B"],pattern:"radial shoulder blush plus cavity mask",amplitude:0.18,heightCorrelation:0.55}
      | .roughness={base:0.48,variation:0.09,map:"reference-pbr/skin/skin_roughness.png",localResponse:"rougher cavity and lenticels; broad wax layer remains soft"}
      | .normal={pattern:"reference-pbr/skin/skin_normal.png",strength:0.16,scale:42,space:"tangent"}
      | .bump={pattern:"sparse shallow lenticels",amplitude:0.002,scale:68}
      | .ambientOcclusion={map:"reference-pbr/skin/skin_ao.png",cavityStrength:0.22,contactShadowBias:0.3,notes:"Only crown and stem contacts receive strong occlusion."}
      | .clearcoat={base:0.22,roughness:0.32}
      | .localOverrides=[
          {id:"coral-blush",region:"upper shoulders and front cheek",color:"#F2675B",strength:0.2,evidenceRefs:["hero-full"]},
          {id:"broad-wax-highlight",region:"upper-front lobes",roughness:0.28,clearcoat:0.22,strength:0.35,evidenceRefs:["hero-full"]},
          {id:"lenticel-speckles",region:"sparse whole-skin deterministic distribution",color:"#E98C7E",roughness:0.62,bumpAmplitude:0.002,evidenceRefs:["hero-full"]},
          {id:"cavity-darkening",region:"crown socket",color:"#52261B",roughness:0.58,strength:0.55,evidenceRefs:["hero-full","sheet-top"]}
        ]
      | .referencePbr={usable:true,confidence:0.86,estimatedFidelity:0.86,targetThreshold:0.7,sourceImage:"design/fruit-theme/apple-v2/apple-hero-reference-v1.png",maps:{albedo:{path:"design/fruit-theme/apple-v2/reference-pbr/skin/skin_albedo.png",url:"skin_albedo.png"},roughness:{path:"design/fruit-theme/apple-v2/reference-pbr/skin/skin_roughness.png",url:"skin_roughness.png"},height:{path:"design/fruit-theme/apple-v2/reference-pbr/skin/skin_height.png",url:"skin_height.png"},normal:{path:"design/fruit-theme/apple-v2/reference-pbr/skin/skin_normal.png",url:"skin_normal.png"},ao:{path:"design/fruit-theme/apple-v2/reference-pbr/skin/skin_ao.png",url:"skin_ao.png"}}}
    ),
    ($mat
      | .id="stem" | .name="Warm faceted wood stem" | .baseColor="#5A2816" | .color="#5A2816"
      | .albedo={dominant:"#5A2816",secondary:["#A68053","#7A3B24"],samplingNotes:"Use the brown pixels of the stem crop; exclude adjacent red skin and green leaf."}
      | .colorVariation={palette:["#5A2816","#7A3B24","#A68053"],pattern:"longitudinal faceted grain",amplitude:0.12,heightCorrelation:0.15}
      | .roughness={base:0.68,variation:0.08,map:"reference-pbr/stem/stem_roughness.png",localResponse:"cut cap slightly smoother and lighter"}
      | .normal={pattern:"reference-pbr/stem/stem_normal.png",strength:0.14,scale:28,space:"tangent"}
      | .ambientOcclusion={map:"reference-pbr/stem/stem_ao.png",cavityStrength:0.18,contactShadowBias:0.35,notes:"Darken embedded socket only."}
      | .localOverrides=[{id:"cut-cap",region:"distal stem cap",color:"#A68053",roughness:0.58,strength:0.5,evidenceRefs:["hero-full"]}]
      | .referencePbr={usable:true,confidence:0.86,estimatedFidelity:0.86,targetThreshold:0.7,sourceImage:"design/fruit-theme/apple-v2/stem-reference-v1.png",maps:{albedo:{path:"design/fruit-theme/apple-v2/reference-pbr/stem/stem_albedo.png",url:"stem_albedo.png"},roughness:{path:"design/fruit-theme/apple-v2/reference-pbr/stem/stem_roughness.png",url:"stem_roughness.png"},height:{path:"design/fruit-theme/apple-v2/reference-pbr/stem/stem_height.png",url:"stem_height.png"},normal:{path:"design/fruit-theme/apple-v2/reference-pbr/stem/stem_normal.png",url:"stem_normal.png"},ao:{path:"design/fruit-theme/apple-v2/reference-pbr/stem/stem_ao.png",url:"stem_ao.png"}}}
    ),
    ($mat
      | .id="leaf" | .name="Folded muted-green leaf" | .baseColor="#818A38" | .color="#818A38"
      | .albedo={dominant:"#818A38",secondary:["#A4AD60","#596522"],samplingNotes:"Use the green pixels of the leaf crop; exclude adjacent skin and stem."}
      | .colorVariation={palette:["#596522","#818A38","#A4AD60"],pattern:"lighter ridge and darker underside",amplitude:0.14,heightCorrelation:0.4}
      | .roughness={base:0.55,variation:0.07,map:"reference-pbr/leaf/leaf_roughness.png",localResponse:"central fold catches a broad satin highlight"}
      | .normal={pattern:"reference-pbr/leaf/leaf_normal.png",strength:0.18,scale:24,space:"tangent"}
      | .ambientOcclusion={map:"reference-pbr/leaf/leaf_ao.png",cavityStrength:0.18,contactShadowBias:0.3,notes:"Darken leaf underside and stem overlap."}
      | .localOverrides=[{id:"vein-highlight",region:"central midrib",color:"#A4AD60",roughness:0.46,strength:0.35,evidenceRefs:["hero-full","sheet-top"]}]
      | .referencePbr={usable:true,confidence:0.86,estimatedFidelity:0.86,targetThreshold:0.7,sourceImage:"design/fruit-theme/apple-v2/leaf-reference-v1.png",maps:{albedo:{path:"design/fruit-theme/apple-v2/reference-pbr/leaf/leaf_albedo.png",url:"leaf_albedo.png"},roughness:{path:"design/fruit-theme/apple-v2/reference-pbr/leaf/leaf_roughness.png",url:"leaf_roughness.png"},height:{path:"design/fruit-theme/apple-v2/reference-pbr/leaf/leaf_height.png",url:"leaf_height.png"},normal:{path:"design/fruit-theme/apple-v2/reference-pbr/leaf/leaf_normal.png",url:"leaf_normal.png"},ao:{path:"design/fruit-theme/apple-v2/reference-pbr/leaf/leaf_ao.png",url:"leaf_ao.png"}}}
    )
  ]
| .repetitionSystems = [
    {id:"five-lobe-radial-field",type:"radial-deformation",count:5,componentRef:"fruit-body",distribution:"fivefold with deterministic phase and restrained asymmetry",geometry:{amplitude:0.055,crownBias:0.85,baseAmplitude:0.025},buildsGeometry:true,evidenceRefs:["hero-full","sheet-top"]},
    {id:"lenticel-field",type:"deterministic-surface-points",count:18,componentRef:"fruit-body",distribution:"sparse nonuniform points outside crown and ground-contact zones",realization:"material-and-shallow-relief",buildsGeometry:false,evidenceRefs:["hero-full"]}
  ]
| .featureReviewTargets = [
    {id:"apple-silhouette",name:"Upper-heavy five-lobed apple silhouette",tier:"critical",passIds:["blockout","form-refinement"],minimumScore:0.86,mustPass:true,componentRefs:["fruit-body"],evidenceRefs:["hero-full","sheet-side","sheet-top"]},
    {id:"crown-base-system",name:"Concave crown and tapered five-point base",tier:"critical",passIds:["blockout","form-refinement"],minimumScore:0.84,mustPass:true,componentRefs:["fruit-body","crown-form","base-form"],evidenceRefs:["hero-full","sheet-top"]},
    {id:"stem-leaf-assembly",name:"Embedded curved stem and folded leaf",tier:"critical",passIds:["structural-pass","form-refinement"],minimumScore:0.84,mustPass:true,componentRefs:["stem","leaf","midrib"],evidenceRefs:["hero-full","sheet-side","sheet-top"]},
    {id:"waxy-skin-response",name:"Crimson-coral waxy skin without plastic glare",tier:"critical",passIds:["material-pass","surface-pass","lighting-pass"],minimumScore:0.82,mustPass:true,componentRefs:["fruit-body"],evidenceRefs:["hero-full"]},
    {id:"game-camera-readability",name:"Fixed game-camera readability and mobile budget",tier:"critical",passIds:["optimization-pass"],minimumScore:0.82,mustPass:true,componentRefs:["root","fruit-body","stem","leaf"],evidenceRefs:["game-audit"]}
  ]
| .lightingFromPhoto = [
    "key light: broad warm-neutral area light from camera upper-left, soft shadow, exposure 0.0 with AgX or ACES-like tone mapping",
    "fill light: cool-neutral low-intensity fill from camera right to retain burgundy cavity separation without flattening the lobes",
    "rim/environment light: restrained warm rear rim plus neutral environment; soft ground contact shadow and ambient occlusion at the stem socket"
  ]
| .qualityTargets.targetFidelity = 0.86
| .qualityTargets.reviewViewpoints = ["fixed-game-three-quarter", "side", "near-top"]
| .performanceBudget = {qualityPriority:"reference-fidelity within mobile collectible budget",targetTriangles:3200,maxTriangles:4000,maxDrawCalls:4,textureSize:1024,fpsTarget:60,optimizationPolicy:"Preserve silhouette, crown cavity, leaf fold, and waxy material response; simplify only invisible micro relief."}
| .referenceCamera = {solved:true,type:"orthographic game-like",fovDegrees:40,aspect:0.695,orientation:{yaw:-20,pitch:32,roll:0},positionHint:[1.65,-2.25,2.8],note:"The final authority is the existing project audit camera; reference framing is matched by normalized bounds rather than photo projection."}
| .buildPasses |= map(.componentRefs = ["root","fruit-body","stem","leaf","crown-form","base-form","cut-top","folded-blade","midrib"])
| .risks = [
    "Single-image PBR extraction is evidence, not exact inverse rendering; neutral and grazing review remain mandatory.",
    "The concept bottom is partly shadowed, so the five-point base must stay shallow for stable Jolt contact.",
    "Cocos imports GLB materials differently from Blender; the fixed project audit plus runtime screenshot is the final material authority."
  ]
