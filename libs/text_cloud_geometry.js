import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

class TextCloudGeometry extends TextGeometry {

    static splitTriangleMidpoint(triangle, midpoint_array, recursions=0){
	const midpoint = new THREE.Vector3();
	if (recursions < 0)
	    return;
	triangle.getMidpoint(midpoint);
	midpoint_array.push(midpoint.x, midpoint.y, midpoint.z);
	if (recursions >= 0.3)
	    TextCloudGeometry.splitTriangleMidpoint(new THREE.Triangle(triangle.a,
								       triangle.b,
								       midpoint),
						    midpoint_array, recursions-1);
	if (recursions >= 0.6)
	    TextCloudGeometry.splitTriangleMidpoint(new THREE.Triangle(triangle.a,
								       triangle.c,
								       midpoint),
						    midpoint_array, recursions-1);
	if (recursions >= 1)
	    TextCloudGeometry.splitTriangleMidpoint(new THREE.Triangle(triangle.b,
								       triangle.c,
								       midpoint),
						    midpoint_array, recursions-1);
    }


    makeNewGeomFromGroup(group){
        var destNumVerts = group.count;
        
	var newBufGeom = new THREE.BufferGeometry();
	var newPosition = new Float32Array( destNumVerts * 3 );
        var origVerts = this.getAttribute( 'position' ).array;
        for ( var iv = 0; iv < destNumVerts; iv ++ ) {
	    var indexOrig = 3 * ( group.start + iv );
	    var indexDest = 3 * iv;
            
	    newPosition[ indexDest ] = origVerts[ indexOrig ];
	    newPosition[ indexDest + 1 ] = origVerts[ indexOrig + 1 ];
	    newPosition[ indexDest + 2 ] = origVerts[ indexOrig + 2 ];
	}

        newBufGeom.setAttribute( 'position', new THREE.Float32BufferAttribute( newPosition, 3 ) );
        return newBufGeom;
    }
    
    constructor(text, params={}, path=null, perGroupTesselate=null){
	super(text, params);
	this.deleteAttribute("uv");
	this.deleteAttribute("color");
        if (perGroupTesselate){
            const groupGeom = new Array();
            this.groups.forEach( (x, i) => {
                const geom = this.makeNewGeomFromGroup(x);
                const tesselate = perGroupTesselate(i, this.groups.length);
                const tessellateModifier = new TessellateModifier(tesselate[0], tesselate[1]);
                groupGeom.push(tessellateModifier.modify(geom));
            });
            this.copy(mergeGeometries(groupGeom));
        } else {
	    this.groups = [];
	    if (params.size !== undefined){
	        const tessellateModifier = new TessellateModifier(params.size/10, 6);
	        this.copy(tessellateModifier.modify(this));
	    }
        }
	this.setAttribute("normal", this.getAttribute("position").clone() );
	this.type = 'TextCloudGeometry';
        this.name = text;
        
	if (path)
	    this.followPath(path);

	this.buffersNeedUpdate = true;
    }


    followPath(path){
	this.computeBoundingBox();
	const max_x = this.boundingBox.max.x;
	const scale_y = path.getLength()/max_x;
	const pos_buf = this.getAttribute("position");
	
	const path_point = new THREE.Vector3();
	const point = new THREE.Vector3();
	const tangent = new THREE.Vector3();
	for (let i=0; i<pos_buf.count; i+=1){
	    const x_pos = pos_buf.getX(i);
	    const offset = x_pos/max_x;
	    point.set(0, pos_buf.getY(i)*scale_y, pos_buf.getZ(i)*scale_y);
	    path.getPointAt(offset,path_point);
	    path.getTangentAt(offset,tangent);
	    // Move to 0 x-position and then rotate
	    const angle_z = Math.atan2(tangent.y, tangent.x);
	    const angle_y = Math.atan2(tangent.z || 0, Math.abs(tangent.x));
	    point.applyEuler(new THREE.Euler(0, angle_y, angle_z, 'ZYX'));
	    point.add(path_point);
	    pos_buf.setXYZ(i, point.x, point.y, point.z);
	}
    }
    

    static async factory(text, fontfile, params, curve=null, perGroupTesselate=null){ 
	return new Promise(function(resolve, reject) {
	    const font = new FontLoader().load(fontfile, (font) => {
		params.font = font;
		var curveArray = curve;
		if (!curve || curve.constructor !== Array)
		    curveArray = [curve];
		const text_geometries = [];
		curveArray.forEach( (x) => {
		    text_geometries.push(new TextCloudGeometry(text, params, x, perGroupTesselate));
		});

		if (!curve || curve.constructor !== Array)
		    resolve(text_geometries[0]);
		else
		    resolve(text_geometries);
	    })
	});
    }

}

export {TextCloudGeometry};
