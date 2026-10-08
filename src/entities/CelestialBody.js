import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();

// Public domain NASA texture URLs
const TEXTURE_URLS = {
  earth: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Blue_Marble_2002.png/1280px-Blue_Marble_2002.png',
  earthNight: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/The_earth_at_night.jpg/1280px-The_earth_at_night.jpg',
};

export class CelestialBody {
  constructor(config, glslNoise, terminatorVertexLogic, terminatorLightMath) {
    this.id = config.id;
    this.name = config.name;
    this.radius = config.r;
    this.dist = config.dist || 0;
    this.orbit = config.orbit || 0;
    this.rot = config.rot || 0;
    this.maxMoonDist = config.maxMoonDist || 0;
    
    this.glslNoise = glslNoise;
    this.terminatorVertexLogic = terminatorVertexLogic;
    this.terminatorLightMath = terminatorLightMath;
    this.isStar = config.isStar || false;
    this.isFixedPosition = config.isFixedPosition || false;

    this.meshGroup = new THREE.Group();
    this.orbitAngle = 0;

    this.createMesh(config);
    if (config.atmosphere) this.createAtmosphere(config.atmosphere);
    if (config.rings) this.createRings(config.rings);
    if (config.moons) this.createMoons(config.moons);
    if (config.clouds) this.createClouds(config.clouds);
  }

  createMesh(config) {
    let material;
    this.uniforms = { time: { value: 0 }, interaction: { value: 0 } };

    if (this.id === 'earth') {
      // Earth gets real textures for realistic continents
      this.createEarthMesh(config);
      return;
    }

    if (config.shader) {
      let vertShader = this.terminatorVertexLogic;
      
      if (this.id === 'sun' || this.isStar) {
        vertShader = `
          ${this.glslNoise}
          varying vec3 vWorldPosition;
          varying vec3 vWorldNormal;
          uniform float time;
          uniform float interaction;
          void main() {
              float erupt = fbm(position * 0.8 - time * 0.5) * interaction * 6.0;
              vec3 newPos = position + normal * erupt;
              vec4 worldPos = modelMatrix * vec4(newPos, 1.0);
              vWorldPosition = worldPos.xyz;
              vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
              gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `;
      }

      const usesTerminator = (this.id !== 'sun' && !this.isStar);
      
      let fShader = `
        ${this.glslNoise}
        varying vec3 vWorldPosition; varying vec3 vWorldNormal; uniform float time; uniform float interaction;
        void main() {
            ${config.shader.fragmentCore}
            ${usesTerminator ? this.terminatorLightMath : ''}
            gl_FragColor = vec4(color ${usesTerminator ? '* light' : ''} + extra, 1.0);
        }
      `;

      material = new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: vertShader,
        fragmentShader: fShader
      });
    } else {
      material = new THREE.MeshStandardMaterial({
        color: config.color,
        roughness: config.roughness || 0.9,
        metalness: config.metalness || 0.1,
      });
    }

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 128, 128), material);
    this.mesh.userData = { id: this.id, interactionState: 0, uniforms: this.uniforms };
    
    if (config.tilt) this.mesh.rotation.z = config.tilt;
    
    this.meshGroup.add(this.mesh);
  }

  createEarthMesh(config) {
    // Load real Earth texture
    const earthTexture = textureLoader.load(TEXTURE_URLS.earth);
    earthTexture.colorSpace = THREE.SRGBColorSpace;
    
    // Load night lights texture  
    const nightTexture = textureLoader.load(TEXTURE_URLS.earthNight);
    nightTexture.colorSpace = THREE.SRGBColorSpace;

    this.uniforms = {
      time: { value: 0 },
      interaction: { value: 0 },
      earthDay: { value: earthTexture },
      earthNight: { value: nightTexture },
    };

    const earthMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D earthDay;
        uniform sampler2D earthNight;
        uniform float interaction;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        void main() {
          vec3 dayColor = texture2D(earthDay, vUv).rgb;
          vec3 nightColor = texture2D(earthNight, vUv).rgb;
          
          // Terminator lighting
          vec3 lightDir = normalize(-vWorldPosition);
          float nDotL = dot(normalize(vWorldNormal), lightDir);
          float light = smoothstep(-0.1, 0.2, nDotL);
          
          // Blend day/night based on sun angle
          float darkSide = smoothstep(0.1, -0.15, nDotL);
          vec3 color = mix(dayColor * light, nightColor * 1.5, darkSide);
          
          // Active state: auroras at poles + amplified city glow
          float polarDist = abs(normalize(vWorldPosition).y);
          float aurora = smoothstep(0.7, 1.0, polarDist) * interaction * 2.0;
          color += vec3(0.1, 0.8, 0.4) * aurora;
          color += nightColor * interaction * darkSide * 2.0;
          
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 128, 64), earthMat);
    this.mesh.userData = { id: this.id, interactionState: 0, uniforms: this.uniforms };
    this.meshGroup.add(this.mesh);
  }

  createAtmosphere(colorHex) {
    const material = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(colorHex) } },
      vertexShader: `
          varying vec3 vNormal;
          void main() {
              vNormal = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
      `,
      fragmentShader: `
          uniform vec3 color; varying vec3 vNormal;
          void main() {
              float fresnel = max(0.0, 1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)));
              float intensity = pow(fresnel, 4.0); 
              gl_FragColor = vec4(color, intensity * 0.25); 
          }
      `,
      blending: THREE.AdditiveBlending, side: THREE.FrontSide, transparent: true, depthWrite: false
    });
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(this.radius * 1.08, 64, 64), material);
    this.meshGroup.add(this.atmosphere);
  }

  createClouds(config) {
    this.cloudUnif = { time: { value: 0 } };
    const cloudMat = new THREE.ShaderMaterial({
        uniforms: this.cloudUnif, transparent: true, depthWrite: false,
        vertexShader: this.terminatorVertexLogic,
        fragmentShader: `
            ${this.glslNoise}
            varying vec3 vWorldPosition; varying vec3 vWorldNormal; uniform float time;
            void main() {
                float n = fbm(vWorldPosition * 3.5 + time * 0.04);
                ${this.terminatorLightMath}
                gl_FragColor = vec4(vec3(1.0) * light, smoothstep(0.45, 0.7, n) * 0.85);
            }
        `
    });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(this.radius * 1.02, 64, 64), cloudMat);
    this.meshGroup.add(this.clouds);
  }

  createRings(config) {
    const ringGeo = new THREE.RingGeometry(config.inner, config.outer, 128);
    const ringMat = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(config.color) } },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
            uniform vec3 color; varying vec2 vUv;
            void main() {
                float d = distance(vUv, vec2(0.5)) * 2.0; 
                float bands = sin(d * 150.0) * sin(d * 50.0);
                float gap = smoothstep(0.68, 0.72, d) - smoothstep(0.72, 0.76, d);
                float alpha = (0.5 + bands * 0.5) * (1.0 - gap * 0.8);
                if(alpha < 0.1 || d > 1.0 || d < 0.5) discard;
                gl_FragColor = vec4(color, alpha * 0.8);
            }
        `,
        transparent: true, side: THREE.DoubleSide
    });
    this.rings = new THREE.Mesh(ringGeo, ringMat);
    this.rings.rotation.x = Math.PI / 2 + 0.3; 
    if (config.tilt) this.rings.rotation.y = config.tilt;
    this.meshGroup.add(this.rings);
  }

  createMoons(moonsData) {
    this.moonsList = [];
    this.moonSystemGrp = new THREE.Group();
    this.meshGroup.add(this.moonSystemGrp);

    moonsData.forEach(m => {
        const moonGrp = new THREE.Group();
        moonGrp.visible = false; 
        
        // Use emissive so moons always glow slightly even without direct light
        const mat = new THREE.MeshStandardMaterial({ 
          color: m.color || 0xaaaaaa, 
          roughness: 0.6, 
          metalness: 0.1,
          emissive: new THREE.Color(m.color || 0xaaaaaa),
          emissiveIntensity: 0.15,
        });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(m.r, 32, 32), mat);
        mesh.position.x = m.dist; 
        moonGrp.add(mesh);
        
        // Orbit ring
        const geo = new THREE.RingGeometry(m.dist - 0.02, m.dist + 0.02, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.15 });
        const ringMesh = new THREE.Mesh(geo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        moonGrp.add(ringMesh);

        mesh.userData = { name: m.name || 'Moon' };

        this.moonSystemGrp.add(moonGrp);
        this.moonsList.push({ group: moonGrp, mesh: mesh, speed: m.speed, name: m.name });
    });
  }

  update(time, delta, isFocused, ORBIT_MULTIPLIER, ROTATION_MULTIPLIER, MOON_MULTIPLIER) {
    // The devourer owns the entire body's transform while swallowing it.
    if (this.isConsumed || this.isBeingConsumed) return;
    if (this.id !== 'sun' && !this.isFixedPosition) {
      this.orbitAngle = time * ORBIT_MULTIPLIER * this.orbit * 0.01; 
      this.meshGroup.position.x = Math.cos(this.orbitAngle) * this.dist;
      this.meshGroup.position.z = Math.sin(this.orbitAngle) * this.dist;
    }
    
    const rotAngle = time * ROTATION_MULTIPLIER * this.rot * 0.01;
    if (this.id === 'uranus') this.mesh.rotation.x = rotAngle; 
    else this.mesh.rotation.y = rotAngle;
    
    if (this.clouds) this.clouds.rotation.y = rotAngle * 1.15; 
    if (this.id === 'sun' || this.isStar) this.meshGroup.rotation.y = rotAngle;

    // Moons visible when focused
    if (this.moonsList) {
      this.moonsList.forEach(m => {
          m.group.visible = isFocused;
          if (isFocused) {
              m.group.rotation.y = time * MOON_MULTIPLIER * m.speed * 0.01;
              m.mesh.rotation.y = rotAngle;
          }
      });
    }

    if (this.uniforms) this.uniforms.time.value = time;
    if (this.cloudUnif) this.cloudUnif.time.value = time;

    // Interaction: keep active while focused
    if (isFocused) {
      this.mesh.userData.interactionState = Math.min(1.0, this.mesh.userData.interactionState + delta * 0.5);
    } else {
      if (this.mesh.userData.interactionState > 0) {
        this.mesh.userData.interactionState -= delta * 0.3;
        if (this.mesh.userData.interactionState < 0) this.mesh.userData.interactionState = 0;
      }
    }
    
    if (this.uniforms && this.uniforms.interaction) {
      this.uniforms.interaction.value = this.mesh.userData.interactionState;
    }
  }
}
