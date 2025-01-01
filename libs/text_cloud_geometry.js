import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';


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

    constructor(text, params, pointsize, path=null){
	super(text, params);
	this.type = 'TextCloudGeometry';

	if (path)
	    this.followPath(path);

	this.setAttribute("normal", this.getAttribute("position").clone() );
	this.deleteAttribute("uv");
	this.deleteAttribute("color");
	this.groups = null;
	this.buffersNeedUpdate = true;
    }


    followPath(path){
	this.computeBoundingBox();
	const max_x = this.boundingBox.max.x;
	const scale_y = path.getLength()/max_x;
	const pos_buf = this.getAttribute("position");
	
	var pointsPerArea = 0;
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
    

    static async factory(text, fontfile, pointsize, params, curve=null){ 
	var loaderPromise = new Promise(function(resolve, reject) {
	    const font = new FontLoader().load(fontfile, (font) => {
		params.font = font;
		var text_geometry = new TextCloudGeometry(text, params, pointsize, curve);
		const tessellateModifier = new TessellateModifier(params.size/10, 6);
		text_geometry = tessellateModifier.modify( text_geometry );
		
		resolve(text_geometry);
	    })
	});

	return loaderPromise;
    }

}

export {TextCloudGeometry};
