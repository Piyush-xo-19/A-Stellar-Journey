import * as THREE from 'three';
import './styles/main.css';

import { Renderer } from './engine/Renderer.js';
import { CameraRig } from './engine/CameraRig.js';
import { InputManager } from './engine/InputManager.js';
import { UIManager } from './engine/UIManager.js';
import { AudioEngine } from './engine/AudioEngine.js';

import { Universe } from './entities/Universe.js';
import { StarSystem } from './entities/StarSystem.js';
import { Galaxy } from './entities/Galaxy.js';
import { solarSystemData } from './data/solarSystem.js';
import { zoomOutSections } from './data/zoomOutSections.js';
import { nearbyStarsData } from './data/nearbyStars.js';
import { localGroupData } from './data/localGroup.js';
import { superclustersData } from './data/superclusters.js';
import { SuperclusterRenderer } from './entities/SuperclusterRenderer.js';
import { MultiverseRenderer } from './entities/MultiverseRenderer.js';
import { PlanetDevourer } from './entities/PlanetDevourer.js';
import { DevourerControls } from './engine/DevourerControls.js';
import { DevourerInput } from './engine/DevourerInput.js';

class App {
  constructor() {
    this.clock = new THREE.Clock();
    
    // Core Engine Setup
    this.renderer = new Renderer('canvas-container');
    this.cameraRig = new CameraRig(this.renderer.camera);
    
    // Entities Setup
    this.universe = new Universe(this.renderer.scene);
    this.solarSystem = new StarSystem(
        this.renderer.scene, 
        solarSystemData, 
        this.universe.glslNoise, 
        this.universe.terminatorVertexLogic, 
        this.universe.terminatorLightMath
    );
    this.galaxy = new Galaxy(
        this.renderer.scene,
        this.universe.glslNoise, 
        this.universe.terminatorVertexLogic, 
        this.universe.terminatorLightMath
    );
    
    this.superclusters = new SuperclusterRenderer(this.renderer.scene);
    this.multiverse = new MultiverseRenderer(this.renderer.scene);
    this.devourer = new PlanetDevourer(this.renderer.scene, this.solarSystem);
    this.systemTime = 0;

    // Engine Managers — total sections = planets + zoom-out sections
    const totalSections = solarSystemData.length + zoomOutSections.length;
    this.uiManager = new UIManager(totalSections);
    this.uiManager.injectAllSections(solarSystemData, zoomOutSections);
    
    this.inputManager = new InputManager(
        this.renderer.camera, 
        [...this.solarSystem.getInteractables(), ...this.galaxy.getInteractables()]
    );
    this.audioEngine = new AudioEngine();

    // State
    this.activeSystemId = 'solar';
    this.activePlanetId = null;
    this.activePlanetData = null;
    this.ORBIT_MULTIPLIER = 4000;  
    this.ROTATION_MULTIPLIER = 12;
    this.MOON_MULTIPLIER = 10;
    this.devourerInput = new DevourerInput(this.devourer);

    this.devourerControls = new DevourerControls(this.devourer, {
      onStart: () => {
        if (this.activeSystemId !== 'solar') this.exitStarSystem();
        this.unfocus();
        this.devourer.start();
      },
      onRestore: () => this.devourer.restore(),
    });
    this.devourer.onConsume = body => {
      if (this.activePlanetId === body.id) this.unfocus();
    };

    this.bindEvents();
    
    // Start first typewriter
    this.uiManager.triggerTypewriter(0);
    
    // Start loop
    this.animate();
  }

  findPlanetDataById(id) {
    return solarSystemData.find(p => p.id === id) 
        || nearbyStarsData.find(p => p.id === id) 
        || localGroupData.find(p => p.id === id) 
        || superclustersData.find(p => p.id === id)
        || null;
  }

  unfocus() {
    this.activePlanetId = null;
    this.activePlanetData = null;
    this.uiManager.setFocusState(false);
  }

  enterStarSystem(starId) {
    this.activeSystemId = starId;
    const starData = nearbyStarsData.find(s => s.id === starId) || localGroupData.find(s => s.id === starId);
    
    // Inject UI: Star + Planets + Return section
    const systemSections = [starData];
    if (starData.planets) {
      systemSections.push(...starData.planets);
    }
    let returnSection;
    if (localGroupData.some(s => s.id === starId)) {
      returnSection = [{
        id: 'return',
        kicker: 'Return',
        name: 'The Local Group',
        description: 'Leave the galaxy and return to the Local Group overview.',
        cameraPos: zoomOutSections[3].cameraPos,
        cameraLook: zoomOutSections[3].cameraLook,
        zoomLevel: 4 
      }];
    } else {
      returnSection = [{
        id: 'return',
        kicker: 'Return',
        name: 'Stellar Neighborhood',
        description: 'Leave the system and return to the stellar neighborhood.',
        cameraPos: zoomOutSections[1].cameraPos,
        cameraLook: zoomOutSections[1].cameraLook,
        zoomLevel: 2 
      }];
    }
    
    this.uiManager.injectAllSections(systemSections, returnSection);
    
    this.inputManager.ignoreNextScroll = true;
    window.scrollTo({ top: 0, behavior: 'instant' });
    this.inputManager.scrollFraction = 0;
    this.inputManager.targetScrollFraction = 0;
    this.uiManager.updateScrollSection(0);
    
    this.activePlanetId = starId;
    this.activePlanetData = starData;
    this.uiManager.setFocusState(true, starData);
  }

  exitStarSystem() {
    const wasLocalGroup = localGroupData.some(s => s.id === this.activeSystemId);
    this.activeSystemId = 'solar';
    this.unfocus();
    
    this.uiManager.injectAllSections(solarSystemData, zoomOutSections);
    
    const targetSectionIdx = solarSystemData.length + (wasLocalGroup ? 3 : 1); // Local Group or Stellar Neighborhood
    const targetScrollFraction = targetSectionIdx / (this.uiManager.totalSections - 1);
    
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const targetY = targetScrollFraction * maxScroll;
    
    this.inputManager.ignoreNextScroll = true;
    window.scrollTo({ top: targetY, behavior: 'instant' });
    this.inputManager.scrollFraction = targetScrollFraction;
    this.inputManager.targetScrollFraction = targetScrollFraction;
    this.uiManager.updateScrollSection(targetScrollFraction);
  }

  getActiveSystemPlanets() {
    if (this.activeSystemId === 'solar') {
      return this.solarSystem.getPlanetsData();
    }
    
    const allStarsAndPlanets = this.galaxy.getStarsData();
    const starId = this.activeSystemId;
    const starData = nearbyStarsData.find(s => s.id === starId) || localGroupData.find(s => s.id === starId);
    
    const activePlanets = [];
    activePlanets.push(allStarsAndPlanets.find(e => e.id === starId));
    if (starData.planets) {
      starData.planets.forEach(p => {
        activePlanets.push(allStarsAndPlanets.find(e => e.id === p.id));
      });
    }
    return activePlanets;
  }

  bindEvents() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('#init-audio-btn')) {
        this.audioEngine.toggle();
      }
    });

    this.inputManager.onScroll = () => {
      if (this.activePlanetId) {
        this.unfocus();
      }
    };

    this.inputManager.onPlanetClick = (mesh) => {
      if (this.devourer.active) return;
      if (this.activePlanetId === mesh.userData.id) {
        this.unfocus();
      } else {
        const isNearbyStar = nearbyStarsData.some(s => s.id === mesh.userData.id) || localGroupData.some(s => s.id === mesh.userData.id);
        if (isNearbyStar && this.activeSystemId === 'solar') {
          // Enter the star system or galaxy
          this.enterStarSystem(mesh.userData.id);
          this.audioEngine.playUIClick();
          return;
        }

        this.activePlanetId = mesh.userData.id;
        this.activePlanetData = this.findPlanetDataById(mesh.userData.id);
        this.uiManager.setFocusState(true, this.activePlanetData);
        this.audioEngine.playUIClick();
      }
    };

    this.inputManager.onBackgroundClick = () => {
      if (this.activePlanetId) {
        this.unfocus();
      }
    };

    this.uiManager.onCloseDashboard = () => {
      this.unfocus();
    };

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.devourer.active) {
        this.devourer.restore();
        return;
      }
      if (e.key === 'Escape' && this.activePlanetId) {
        this.unfocus();
      }
    });
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    
    const delta = document.hidden ? 0 : Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.getElapsedTime();
    // Hold the orbital layout steady during play so targets can be approached.
    if (!this.devourer.active) this.systemTime += delta;

    // 1. Update Input state
    this.inputManager.update();
    
    // 2. Update UI
    this.uiManager.updateCursor();
    this.uiManager.updateScrollSection(this.inputManager.scrollFraction);
    
    // Auto-exit star system if user scrolls to the very bottom
    if (this.activeSystemId !== 'solar' && this.uiManager.currentSection === this.uiManager.totalSections - 1) {
      this.exitStarSystem();
    }

    // 3. Update Audio
    this.audioEngine.updateWarpSound(this.inputManager.targetScrollVelocity);

    // 4. Mouse parallax
    this.cameraRig.updateMouseParallax(this.inputManager.mouseNormX, this.inputManager.mouseNormY);

    // 5. Update Universe & System
    this.universe.update(time);
    this.solarSystem.update(this.systemTime, delta, this.activePlanetId, this.ORBIT_MULTIPLIER, this.ROTATION_MULTIPLIER, this.MOON_MULTIPLIER);
    this.devourer.update(delta);
    this.devourerControls.updateMap();

    // 6. Update Camera Rig — now handles zoom-out sections too
    const allEntities = [...this.solarSystem.getPlanetsData(), ...this.galaxy.getStarsData()];
    
    const activeSystemPlanets = this.getActiveSystemPlanets();
    const currentZoomOutSections = this.activeSystemId === 'solar' ? zoomOutSections : [{
      id: 'return',
      kicker: 'Return',
      name: 'Stellar Neighborhood',
      description: 'Leave the system and return to the stellar neighborhood.',
      cameraPos: zoomOutSections[1].cameraPos,
      cameraLook: zoomOutSections[1].cameraLook,
      zoomLevel: 2 
    }];

    if (this.devourer.active) {
      const frame = this.devourer.getCameraFrame(this.renderer.camera.aspect);
      const blend = 1 - Math.exp(-delta * 3);
      this.cameraRig.currentZoomLevel = 0;
      this.cameraRig.targetPos.copy(frame.position);
      this.cameraRig.targetLook.copy(frame.look);
      this.cameraRig.smoothPos.lerp(frame.position, blend);
      this.cameraRig.smoothLook.lerp(frame.look, blend);
      this.renderer.camera.position.copy(this.cameraRig.smoothPos);
      this.renderer.camera.lookAt(this.cameraRig.smoothLook);
      this.renderer.camera.fov = 45;
      this.renderer.camera.updateProjectionMatrix();
    } else {
      this.cameraRig.update(
          delta,
          this.inputManager.scrollFraction,
          this.inputManager.targetScrollVelocity,
          activeSystemPlanets,
          this.activePlanetId,
          time,
          currentZoomOutSections,
          allEntities
      );
    }

    // Update Debug info if available
    if (this.uiManager.debugInfo && this.cameraRig) {
      this.uiManager.debugInfo.innerText = `Cam Y: ${Math.round(this.cameraRig.camera.position.y)} | Look X: ${Math.round(this.cameraRig.targetLook.x)} Z: ${Math.round(this.cameraRig.targetLook.z)} | ZLevel: ${this.cameraRig.currentZoomLevel}`;
    }

    // 7. Update Galaxy visibility based on zoom level
    const isStarSystemFocused = this.activeSystemId !== 'solar';
    this.galaxy.updateVisibility(this.cameraRig.currentZoomLevel, isStarSystemFocused, this.activeSystemId);
    this.galaxy.update(time, delta, this.activePlanetId, this.ORBIT_MULTIPLIER, this.ROTATION_MULTIPLIER, this.MOON_MULTIPLIER);

    // 8. Update Superclusters & Multiverse
    this.superclusters.updateVisibility(this.cameraRig.currentZoomLevel);
    this.superclusters.update(time);
    
    this.multiverse.updateVisibility(this.cameraRig.currentZoomLevel);
    this.multiverse.update(time);

    // 9. Render
    this.renderer.update(delta);
  }
}

window.onload = () => {
  new App();
};
