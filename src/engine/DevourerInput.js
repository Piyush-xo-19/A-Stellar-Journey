const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

export class DevourerInput {
  constructor(devourer, eventTarget = window, documentTarget = document) {
    this.devourer = devourer;
    this.keys = new Set();
    devourer.onResetInput = () => this.clear();

    eventTarget.addEventListener('keydown', event => {
      if (!devourer.active || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (MOVEMENT_KEYS.has(event.code)) {
        event.preventDefault();
        if (!devourer.paused) this.keys.add(event.code);
        this.sync();
      } else if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        // Do not let Enter also activate the last focused pause/restart button.
        event.preventDefault();
        if (!event.repeat) devourer.eat();
      }
    }, true);
    eventTarget.addEventListener('keyup', event => {
      this.keys.delete(event.code);
      this.sync();
    });
    const suspend = () => {
      this.clear();
      if (devourer.active && !devourer.paused && devourer.state !== 'complete') devourer.togglePause();
    };
    eventTarget.addEventListener('blur', suspend);
    documentTarget.addEventListener('visibilitychange', () => {
      if (documentTarget.hidden) suspend();
    });
  }

  sync() {
    const enabled = this.devourer.active && !this.devourer.paused;
    this.devourer.setMovement(
      enabled ? Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')) : 0,
      enabled ? Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW')) : 0,
    );
  }

  clear() {
    this.keys.clear();
    this.devourer.setMovement(0, 0);
  }
}
