import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';


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
	this.type = 'TextCloudGemoetry';

	if (path)
	    this.followPath(path);

	const pos_buf = this.getAttribute("position");
	const new_points = [];
	
	var pointsPerArea = 0;
	for (let i=0; i<pos_buf.count; i+=3){
	    const triangle = new THREE.Triangle();
	    triangle.setFromAttributeAndIndices(
		pos_buf,
		i,
		i+1,
		i+2);

	    for (let j=0; j<3; j+=1){
		new_points.push(pos_buf.getX(i+j));
		new_points.push(pos_buf.getY(i+j));
		new_points.push(pos_buf.getZ(i+j));
	    }
	    
	    const area = triangle.getArea();
	    pointsPerArea += area/(pointsize**2);
	    const recursions = Math.log(pointsPerArea)/Math.log(3);
	    if (recursions >= 0){
		this.constructor.splitTriangleMidpoint(triangle, new_points, recursions);
		pointsPerArea = 0;
	    }
	}
	
	const new_pos_count = new_points.length/3;
	const new_pos_array = new Float32Array(new_pos_count*3);
	new_pos_array.set(new_points);
	this.setAttribute("position", new THREE.BufferAttribute(new_pos_array, 3));
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
		const text_geometry = new TextCloudGeometry(text, params, pointsize, curve);
		resolve(text_geometry);
	    })
	});

	return loaderPromise;
    }

}

export {TextCloudGeometry};
