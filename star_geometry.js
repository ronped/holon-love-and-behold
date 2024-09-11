import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

class StarGeometry extends THREE.BufferGeometry {

    constructor( points, color = null) {
	super();

	this.type = 'StarGeometry';

	if (color){
	    this.color = new THREE.Color(color);
	}

	    
	
	var perlin = new ImprovedNoise( );

	const positionBuf = new THREE.BufferAttribute( new Float32Array(3*points), 3),
	      normalBuf = new THREE.BufferAttribute( new Float32Array(3*points), 3),
	      colorBuf = new THREE.BufferAttribute( new Float32Array(3*points), 3),
	      v = new THREE.Vector3( ),
	      c = new THREE.Color( );

	for( var i=0; i<points; i++ )
	{
	    v.randomDirection( ).setLength( 5*Math.pow(Math.random(),1/5) );
	    v.x = v.x*(1+0.4*Math.sin(3*v.y)+0.4*Math.sin(2*v.z));
	    v.y = v.y*(1+0.4*Math.sin(3*v.z)+0.4*Math.sin(2*v.x));
	    v.z = v.z*(1+0.4*Math.sin(3*v.x)+0.4*Math.sin(2*v.y));
	    positionBuf.setXYZ( i, v.x, v.y, v.z );
	    normalBuf.setXYZ( i, v.x, v.y, v.z );
	
	
	    var noise = (perlin.noise( v.x, v.y, v.z ) +
			 perlin.noise( v.y, v.z, v.x ) +
			 perlin.noise( v.z, v.x, v.y ));
	    
	    if( noise<0.3 ) {i--; continue;}
	    if (this.color){
		c.copy(this.color)
	    } else {
		c.setHSL( 0.5+0.15*Math.random(), 0.5+0.5*Math.random(), Math.random() );
	    }
	    colorBuf.setXYZ( i, c.r, c.g, c.b );
	}

	this.setAttribute('color', colorBuf);
	this.setAttribute('normal', normalBuf);
	this.setAttribute('position', positionBuf);
    }

    static getSplitGeometry(splitPoints, color=null){
	var totalPoints = 0;
	splitPoints.forEach( (p) => {totalPoints += p});

	const geom = new StarGeometry(totalPoints, color);
	const splitGeom = [];

	var pos = 0;
	splitPoints.forEach( (p) => {
	    const new_geom = new THREE.BufferGeometry();
	    ["color", "normal", "position"].forEach( (type) => {
		new_geom.setAttribute(type,
				      new THREE.BufferAttribute(geom.getAttribute(type).array.slice(pos*3, (pos+p)*3), 3));
	    });
	    splitGeom.push(new_geom);
	    pos += p;
	});

	return splitGeom;
    }
    
}

export {StarGeometry};
