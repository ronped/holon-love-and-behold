import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';


class holonLogoGeometry {

    thickness_func(x){
        return 0.001+this.max_thickness*(-Math.pow(2*x-1,8)+1);
    }

    
    static atan(x, y) {
	const sign_x = x != 0.0 ? x/Math.abs(x) : 1;
	var angle;
	if (y==0.0){
            angle = sign_x*Math.PI/2;
	} else {
            angle = Math.atan(x/y);
	}
	if (y < 0){
            angle += sign_x*Math.PI/2;
	}
	
	return angle;
    }

    static  rotate_around_x(vertex, angle){
	return [vertex[0],
		vertex[1]*Math.cos(angle) - vertex[2]*Math.sin(angle),
		vertex[1]*Math.sin(angle) + vertex[2]*Math.cos(angle)];
    }

    static  rotate_around_y(vertex, angle){
	return [vertex[0]*Math.cos(angle) + vertex[2]*Math.sin(angle),
		vertex[1],
		-vertex[0]*Math.sin(angle) + vertex[2]*Math.cos(angle)];
    }

    static  rotate_around_z(vertex, angle){
	return [vertex[0]*Math.cos(angle) - vertex[1]*Math.sin(angle),
		vertex[0]*Math.sin(angle) + vertex[1]*Math.cos(angle),
		vertex[2]];
    }


    static vertex_circle(segments, center, normal, radius, offset = 0){
	// Return a ring of vertices
	const verts = [];
	const norms = [];
	center = [center.x, center.y, center.z || 0];
	normal = new THREE.Vector3(normal.x, normal.y, normal.z || 0);
	
	let rotate_angle_x = 0;
	let rotate_angle_y = 0;
	var rotate_angle_z;
	if (normal.z != 0.0){
            // Find the rotation angles from the z-plane normal vector 
	    // rotating clockwise around x-axis 
            rotate_angle_x = -holonLogoGeometry.atan(normal.y, normal.z);
            // Find the rotation angles for rotating the circle normal
            // vector clockwise around the z-axis to end up parallel 
            // to the input normal vector
            rotate_angle_z = -holonLogoGeometry.atan(normal.x, normal.y);
	} else {
	    // If z-component is zero then rotate around y-axis first
	    rotate_angle_y = holonLogoGeometry.atan(normal.x, normal.z);
            rotate_angle_z = holonLogoGeometry.atan(normal.y, normal.x);
	}

	
	for (let i=0; i<segments; ++i){
            const angle = (Math.PI*2) * (i + offset) / segments;
            // Make a vertex in the z=0 plane
            let vertex=[Math.cos(angle),
			Math.sin(angle),
			0];
            // rotate around x-axis
            if (rotate_angle_x != 0){
		vertex=holonLogoGeometry.rotate_around_x(vertex, rotate_angle_x);
	    }
	    // rotate around y-axis
            if (rotate_angle_y != 0){
		vertex=holonLogoGeometry.rotate_around_y(vertex, rotate_angle_y);
            }
            // rotate around z-axis
            vertex=holonLogoGeometry.rotate_around_z(vertex, rotate_angle_z);

	    // Normal is the same as 
	    norms.push.apply(norms, vertex);

            // scale and translate
	    for (let c=0; c<center.length; ++c){
		vertex[c] *= radius;
		vertex[c] += center[c];
	    }
	    verts.push.apply(verts, vertex);
	}
	
	return [verts, norms];
    }

    make_cylinder_from_path(path, radius, path_dir=null){
        // Make a cylinder
        const verts = [];
        const norms = [];
        const idx = [];
        const colors = [];
    
        let path_direction = new THREE.Vector3();
        for (let i=0; i<path.length; ++i){
    	    if (path_dir){
    		path_direction = path_dir;
    	    } else {
                if (i+1 < path.length){
    		    path_direction = path[i+1].clone().sub(path[i]);
                }
    	    }
	    
    	    var rad;
            if (radius.constructor === Array){
    		rad = radius[i];
    	    } else {
    		rad = radius;
    	    }
            
            let [new_verts, new_norms] = holonLogoGeometry.vertex_circle(this.circle_segments, path[i], path_direction, rad, Math.random());
    	    verts.push.apply(verts, new_verts);
            norms.push.apply(norms, new_norms);
    
            // Make index buffer
    	    if (i<(path.length-1)){
    		for (let j=0; j<this.circle_segments; ++j){
    		    idx.push(i*this.circle_segments+j,(i+1)*this.circle_segments+(j+1)%this.circle_segments, (i+1)*this.circle_segments+j,
    			     i*this.circle_segments+(j+1)%this.circle_segments, (i+1)*this.circle_segments+(j+1)%this.circle_segments, i*this.circle_segments+j);
    		}
    	    }
	    
    	    if (this.pointgeo){
    		for (let j=0; j<this.circle_segments; ++j){
    		    colors.push(this.color.r, this.color.g, this.color.b);
    		}
    	    }
        }
        
        const geometry = new THREE.BufferGeometry();
        const positionAttribute = new THREE.BufferAttribute(new Float32Array(verts), 3);
        geometry.setAttribute('position', positionAttribute);
        if (this.pointgeo){
    	    geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(colors), 3));
    	    geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(norms), 3));
        } else {
    	    geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(norms), 3));
    	    geometry.setIndex(idx);	
        }
        
        return geometry;
    }

    generate_cylinder_path_from_func(path_func, start, end, points){
	let path=[];
	let radius=[];
	let step_size = (end-start)/(points-1);
	for (let i=0; i<points; ++i){
	    const point = path_func(start+i*step_size);
	    path.push(new THREE.Vector3(point[0], point[1], point[2]));
	    radius.push(this.thickness_func(i/(points-1)));
	}

	return  this.make_cylinder_from_path(path, radius);
    }

    get_satellites(){
	const sphere_points_per_90_degree = 12
	const sphere_geom = new THREE.SphereGeometry( this.max_thickness, 2*sphere_points_per_90_degree, sphere_points_per_90_degree );
	if (this.pointgeo){
	    sphere_geom.deleteAttribute("normal");
	    sphere_geom.deleteAttribute("uv");
	    sphere_geom.index = null;
	    const points = sphere_geom.getAttribute("position").count;
	    const colors = new Float32Array(points*3);
	    for (let i=0; i<points; i++){
		colors[3*i] = this.color.r;
		colors[3*i+1] = this.color.g;
		colors[3*i+2] = this.color.b;
	    }
	    sphere_geom.setAttribute("colors", new THREE.BufferAttribute(colors, 3));
	}

	const satellite1 = sphere_geom;
	const satellite2 = sphere_geom.clone();
	satellite1.translate(this.center.x-0.15, this.center.y, this.center.z);
	satellite2.translate(this.center.x+0.45*Math.cos(Math.PI/4), this.center.y-0.45*Math.sin(Math.PI/4), this.center.z);

	return [satellite1, satellite2];
    }

    static sine_func(i, x, y, z, units_per_period, magnitude){
	return [x + i*units_per_period/(2*Math.PI),
		y + magnitude*Math.sin(i),
		z];
    }

    sine_wave_left(i){
	return holonLogoGeometry.sine_func(i, this.center.x, this.center.y, this.center.z/*+this.max_thickness*/, this.scale*0.64, this.scale*0.2);
    }
    
    sine_wave_right(i){
	return holonLogoGeometry.sine_func(i, this.center.x, this.center.y, this.center.z/*-this.max_thickness*/, this.scale*0.64, -this.scale*0.2);
    }

    sine_wave_big(i){
	return holonLogoGeometry.sine_func(i, this.center.x, this.center.y, this.center.z, this.scale*0.64*2, -this.scale*0.2*3.5);
    }

    
    
    constructor(color=0xF0F0F0, pointgeo=false, scale=1.0, center = new THREE.Vector3(0,0,0), circle_segments = 16, points = 128, max_thickness = null) {
	this.center = center;
	this.circle_segments = circle_segments*scale;
	this.points = points*scale;
	this.max_thickness = max_thickness || 0.05*scale;
	this.color = new THREE.Color(color);
	this.pointgeo = pointgeo;
	this.scale = scale;
	
	const group = new THREE.Group();
	const sine_wave_left_geom = this.generate_cylinder_path_from_func(this.sine_wave_left.bind(this), -2.5*Math.PI, 1*Math.PI, this.points);
	const sine_wave_right_geom = this.generate_cylinder_path_from_func(this.sine_wave_right.bind(this), -Math.PI, 2.5*Math.PI, this.points);
	const sine_wave_big_geom = this.generate_cylinder_path_from_func(this.sine_wave_big.bind(this), -Math.PI, Math.PI, this.points*2);

	
	this.geometry = BufferGeometryUtils.mergeGeometries([sine_wave_left_geom, sine_wave_right_geom, sine_wave_big_geom], true); 

	return this;
    }

}

export { holonLogoGeometry };
