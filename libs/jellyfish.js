import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import { morphPointCloud, morphLineCloud } from "../libs/morph_point_cloud.js";

class JellyfishPointCloud extends morphPointCloud {

    static TYPE_JELLYFISH1 = 0;
    static TYPE_JELLYFISH2 = 1;
    static TYPE_JELLYFISH3 = 2;
    static TYPE_SEAHORSE = 3;
    static TYPE_COUNT = 4;

    clearUpdate(){
        this.updateFuncs = this.updateFuncs.slice(0,2);
    }
    
    setupMoveTexture(){
        super.clearUpdate();
        const textureHeight = this.moveFrequency.length;
        const textureWidth = 128;
        this.textureData = [new Float32Array(textureWidth*textureHeight)]
        this.moveTexture = [new THREE.DataTexture( this.textureData[0], textureWidth, textureHeight, THREE.RedFormat, THREE.FloatType,
		           		           THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping)];
        this.moveTexture.forEach( (x) => {
	    x.internalFormat = 'R32F';
	    x.magFilter = THREE.LinearFilter;
	    x.minFilter = THREE.LinearFilter;
        });

        // Setup how the jellyfish expands and contracts
        this.onUpdate( (obj, time) => {
            // Expand and contract the upper 18% of the jellyfish
            for (let v=0; v<textureHeight; v++){
                for (let u=0; u<textureWidth; u++){
                    this.textureData[0][v*textureWidth+u] = (u < 0.82*textureWidth) ? 0 : 0.3*(0.5 + 0.5*Math.sin(this.moveFrequency[v]*time*2*Math.PI));
                }
            }
	    this.moveTexture[0].needsUpdate = true;
        });

        // Setup how the jellyfish position moves in up direction when contracting
        this.onUpdate( (obj, time) => {
            if (!this.moving)
                return;
            this.currentDisplacement = this.currentDisplacement || new Array(this.count).fill(0);
            this.currentSpeed = this.currentSpeed || new Array(this.count).fill(0);
            for (let i=0; i<this.count; i++){
                // Get up vector after this instance has been rotated
                const upDir = new THREE.Vector3(0,1,0).applyEuler(this.instance[i].rotation);
                // Get current displacement of the instance
                const displacement =  this.textureData[0][(i%textureHeight)*textureWidth + Math.floor(0.9*textureWidth)];
                const dispDelta = displacement - this.currentDisplacement[i];
                this.currentDisplacement[i] = displacement;
                // If contracting then move proportional to the derivative
                if (dispDelta < 0){
                    this.currentSpeed[i] = Math.max(-dispDelta*0.3, this.currentSpeed[i]);
                } else {
                    this.currentSpeed[i] *= 0.98;
                }
                this.instance[i].position.add(upDir.multiplyScalar(this.currentSpeed[i]));
            }
        });
    }

    
    constructor(pointSize, pointSpriteFile, instanceCount=1, moveFrequency=0.2, name="Jellyfish Point Cloud", enableBloom=true, dumpPosMap=false, loadPosMap=false){
	super({
            num_points: 100000, //30000,
            point_size: pointSize,
            color: 0xffffff,
            alpha: 1.0,
            point_sprite_file: pointSpriteFile,
            enableBloom: enableBloom,
            instanceCount: instanceCount,
            name: name
        });

        this.dumpPosMap = dumpPosMap;
        this.loadPosMap = loadPosMap;
        this.perInstanceMoveFrequency = moveFrequency.constructor === Array;
        if (this.perInstanceMoveFrequency){
            this.moveFrequency = moveFrequency;
        } else {
            this.moveFrequency = [moveFrequency];
        }
        this.moving = false;
	this.setupMoveTexture();
    }

    startMove(){
        this.moving = true;
    }
    
    stopMove(){
        this.moving = false;
    }

    load(descriptor, initMorphId=0, dumpPosMap=false, loadPosMap=false){
        const descr = [];

        const commonDescrProps = {
	    pos:new THREE.Vector3(0,0,0),
	    textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_KALEIDO | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN,
	    textureMapScale: new THREE.Vector2(0.1, 0.1),
            textureMapViewPos: new THREE.Vector3(0,1,0),
            textureMapUp: new THREE.Vector3(0,0,1),
            rotateCloudBounds: false,
            bloomIntensity: 0.7,
        };

        descr.push( ... [
            {
                filename: "../assets/glb/jellyfish.glb",
                //sortPosSpheric: this.dumpPosMap && { downloadFile: "jellyfish_pos_map.json" },
                sortPos: (this.dumpPosMap &&
                          { sortFunc: (a, b) => (a.y - b.y),
                            downloadFile : "jellyfish_pos_map.json"
                          }),
		posMapFile: this.loadPosMap && "../assets/posmaps/jellyfish_pos_map.json",
	        randPosOrder: !this.dumpPosMap && !this.loadPosMap,
	        scale: new THREE.Vector3(5, 5, 5),
	        pos_noise: 0,
	        textureMap: "../assets/abstract.png",
	        scaleTimeFBM: 1,
	        scaleTimePerlin: 0.2,
	        displacementMap: [null, this.moveTexture[0]],
	        displacementMapNormal: [new THREE.Vector3(0,0,1), new THREE.Vector3(0,1,0)],
	        displacementMapFlags: [morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL,
                                       ((this.perInstanceMoveFrequency && 1) || 0) * morphPointCloud.DISPLACEMENT_MAP_INSTANCE_U_MAPPING + morphPointCloud.DISPLACEMENT_MAP_ENABLE +
                                       morphPointCloud.DISPLACEMENT_MAP_PERP_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_SWAP_UV],
                displacementMapScale: [1.0, 0.3],
                ...commonDescrProps
	    },
            {
                filename: "../assets/glb/jellyfish2.glb",
                sortPos: (this.dumpPosMap &&
                          { sortFunc: (a, b) => (a.y - b.y),
                            downloadFile : "jellyfish2_pos_map.json"
                          }),
                //sortPosSpheric: this.dumpPosMap && { downloadFile: "jellyfish2_pos_map.json" },
		posMapFile: this.loadPosMap && "../assets/posmaps/jellyfish2_pos_map.json",
	        randPosOrder: !this.dumpPosMap && !this.loadPosMap,
                tesselate: [10, 0],
	        scale: new THREE.Vector3(0.15, 0.15, 0.15),
	        rotate:new THREE.Vector3(0,0,-Math.PI/2),
	        pos_noise: 0.1,
	        textureMap: "../assets/abstract2.png",
	        scaleTimeFBM: 1,
	        scaleTimePerlin: 0.1,
	        displacementMap: [null, this.moveTexture[0]],
	        displacementMapNormal: [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0)],
	        displacementMapFlags: [morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL,
                                       ((this.perInstanceMoveFrequency && 1) || 0) * morphPointCloud.DISPLACEMENT_MAP_INSTANCE_U_MAPPING + morphPointCloud.DISPLACEMENT_MAP_ENABLE +
                                       morphPointCloud.DISPLACEMENT_MAP_PERP_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_SWAP_UV],
                displacementMapScale: [1.5, 0.3],
                ...commonDescrProps
            },

            {
                filename: "../assets/glb/jellyfish3.glb",
                sortPos: (this.dumpPosMap &&
                          { sortFunc: (a, b) => (a.y - b.y),
                            downloadFile : "jellyfish3_pos_map.json"
                          }),
                //sortPosSpheric: this.dumpPosMap && { downloadFile: "jellyfish3_pos_map.json" },
		posMapFile: this.loadPosMap && "../assets/posmaps/jellyfish3_pos_map.json",
	        randPosOrder: !this.dumpPosMap && !this.loadPosMap,
                tesselate: [10, 0],
	        scale: new THREE.Vector3(1, 1, 1),
	        pos:new THREE.Vector3(0,0,0),
	        rotate:new THREE.Vector3(-0.2,0,Math.PI/6),
	        pos_noise: 0.01,
	        textureMap: "../assets/abstract.png",
	        scaleTimeFBM: 1,
	        scaleTimePerlin: 0.1,
	        displacementMap: [null, this.moveTexture[0]],
	        displacementMapNormal: [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0)],
	        displacementMapFlags: [morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL,
                                       ((this.perInstanceMoveFrequency && 1) || 0) * morphPointCloud.DISPLACEMENT_MAP_INSTANCE_U_MAPPING + morphPointCloud.DISPLACEMENT_MAP_ENABLE +
                                       morphPointCloud.DISPLACEMENT_MAP_PERP_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_SWAP_UV],
                displacementMapScale: [1.5, 0.3],
                ...commonDescrProps
            },
            {
                filename: "../assets/glb/seahorse.glb",
                ...commonDescrProps,
                sortPos: (this.dumpPosMap &&
                          { sortFunc: (a, b) => (a.y - b.y),
                            downloadFile : "seahorse_pos_map.json"
                          }),
                //sortPosSpheric: this.dumpPosMap && { downloadFile: "seahorse_pos_map.json" },
		posMapFile: this.loadPosMap && "../assets/posmaps/seahorse_pos_map.json",
	        randPosOrder: !this.dumpPosMap && !this.loadPosMap,
                tesselate: [10, 0],
	        scale: new THREE.Vector3(0.5, 0.5, 0.5),
	        pos:new THREE.Vector3(0,0,0),
	        rotate:new THREE.Vector3(-Math.PI/6,0,0),
	        pos_noise: 0.01,
	        textureMap: "../assets/abstract2.png",
	        scaleTimeFBM: 1,
	        scaleTimePerlin: 0.2,
	        displacementMap: [null, this.moveTexture[0]],
	        displacementMapNormal: [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0)],
	        displacementMapFlags: [morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL,
                                       ((this.perInstanceMoveFrequency && 1) || 0) * morphPointCloud.DISPLACEMENT_MAP_INSTANCE_U_MAPPING + 0*morphPointCloud.DISPLACEMENT_MAP_ENABLE +
                                       morphPointCloud.DISPLACEMENT_MAP_PERP_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_SWAP_UV],
                displacementMapScale: [1.5, 1.0],
	        textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV
            }
        ]);

        
        var displacementDescrIdx = descr.length-1;
        descriptor.forEach( (d) => {
            if (d.useJellyDisplacement){
                ["displacementMap", "displacementMapNormal", "displacementMapFlags", "displacementMapScale"].forEach( (param) => {
                    d[param] = descr[displacementDescrIdx][param];
                });
            }
            descr.push(d);
        });
	return super.load(descr);
    }

}

export {JellyfishPointCloud};
