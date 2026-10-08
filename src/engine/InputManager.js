import * as THREE from 'three';

export class InputManager {
  constructor(camera, interactableMeshes) {
    this.camera = camera;
    this.interactableMeshes = interactableMeshes;
    
    this.raycaster = new THREE.Raycaster();
    this.mouseVec = new THREE.Vector2();

    // Mouse normalized position for parallax (-1 to 1)
    this.mouseNormX = 0;
    this.mouseNormY = 0;

    // Scroll tracking — smooth
    this.lastScrollY = window.scrollY;
    this.targetScrollVelocity = 0;
    this.scrollFraction = 0;
    this.targetScrollFraction = 0;
    this.ignoreNextScroll = false;
    
    // Callbacks
    this.onPlanetClick = null;
    this.onBackgroundClick = null;
    this.onScroll = null;

    this.initEvents();
  }

  initEvents() {
    window.addEventListener('mousemove', (e) => {
      // Always update normalized mouse coords for free camera parallax
      this.mouseNormX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNormY = (e.clientY / window.innerHeight) * 2 - 1;
    });

    // Click handler — simple, no drag tracking needed for planet selection
    window.addEventListener('click', (e) => {
      // Skip if clicking on UI buttons
      if (e.target.closest('.interactive-btn') || e.target.closest('.dash-close')) return;

      // If clicking anywhere on the dashboard overlay (but not close button), treat as background click
      if (e.target.closest('#planet-dashboard')) {
        if (this.onBackgroundClick) this.onBackgroundClick();
        return;
      }

      // Raycast against planets
      this.mouseVec.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseVec.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouseVec, this.camera);
      
      const visibleMeshes = this.interactableMeshes.filter(mesh => {
        for (let parent = mesh; parent; parent = parent.parent) {
          if (!parent.visible) return false;
        }
        return true;
      });
      const intersects = this.raycaster.intersectObjects(visibleMeshes);
      
      if (intersects.length > 0 && this.onPlanetClick) {
        this.onPlanetClick(intersects[0].object);
      } else if (this.onBackgroundClick) {
        this.onBackgroundClick();
      }
    });

    window.addEventListener('scroll', () => {
      if (this.ignoreNextScroll) {
        this.ignoreNextScroll = false;
        this.lastScrollY = window.scrollY;
        return;
      }

      const scrollY = window.scrollY;
      this.targetScrollVelocity = scrollY - this.lastScrollY; 
      this.lastScrollY = scrollY;
      
      const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
      this.targetScrollFraction = scrollY / maxScroll;

      if (this.onScroll) this.onScroll();
    });
  }

  update() {
    this.targetScrollVelocity *= 0.9;
    // Smoothly interpolate scroll fraction for buttery camera movement
    this.scrollFraction += (this.targetScrollFraction - this.scrollFraction) * 0.08;
  }
}
