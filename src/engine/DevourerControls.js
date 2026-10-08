export class DevourerControls {
  constructor(devourer, { onStart, onRestore }) {
    this.devourer = devourer;
    this.element = document.createElement('aside');
    this.element.className = 'devourer-controls';
    this.element.setAttribute('aria-label', 'Cosmic Devourer controls');
    this.element.innerHTML = `
      <div class="devourer-heading"><span class="devourer-signal" aria-hidden="true"></span> COSMIC DEVOURER</div>
      <p class="devourer-status" role="status" aria-live="polite" aria-atomic="true"></p>
      <div class="devourer-progress" role="progressbar" aria-label="Planets eaten" aria-valuemin="0" aria-valuemax="${devourer.prey.length}" aria-valuenow="0"><span></span></div>
      <div class="devourer-actions">
        <button class="interactive-btn devourer-launch" type="button">Play as the monster</button>
        <button class="interactive-btn devourer-pause" type="button" hidden>Pause</button>
        <button class="interactive-btn devourer-restore" type="button" hidden>Restore planets</button>
      </div>
      <p class="devourer-caption">WASD to move · Enter to eat a nearby planet</p>
    `;
    document.body.appendChild(this.element);
    this.map = document.createElement('aside');
    this.map.className = 'devourer-map';
    this.map.hidden = true;
    this.map.innerHTML = `<div class="devourer-heading">SOLAR MAP</div>
      <svg viewBox="-220 -220 440 440" role="img" aria-label="Solar map: green triangle is you, green dot is the nearest planet">
        <circle r="210" fill="none" stroke="#ffffff20" stroke-width="2" />
        <path d="M0 -210V210M-210 0H210" stroke="#ffffff10" stroke-width="1" />
        <circle r="8" fill="#ffc65c"><title>Sun</title></circle>
        ${devourer.prey.map(body => `<circle data-planet="${body.id}" r="5" fill="#e5daff"><title>${body.name}</title></circle>`).join('')}
        <path class="map-player" d="M0 -11L-7 8L0 4L7 8Z" fill="#9affd7" stroke="#07151b" stroke-width="2" />
      </svg><p>W ↑ &nbsp; A ← &nbsp; S ↓ &nbsp; D →</p>`;
    document.body.appendChild(this.map);
    this.mapDots = devourer.prey.map(body => this.map.querySelector(`[data-planet="${body.id}"]`));
    this.mapPlayer = this.map.querySelector('.map-player');
    this.status = this.element.querySelector('.devourer-status');
    this.progress = this.element.querySelector('.devourer-progress');
    this.launch = this.element.querySelector('.devourer-launch');
    this.pause = this.element.querySelector('.devourer-pause');
    this.restore = this.element.querySelector('.devourer-restore');
    this.caption = this.element.querySelector('.devourer-caption');
    this.launch.addEventListener('click', () => {
      onStart();
      this.launch.blur();
    });
    this.pause.addEventListener('click', () => devourer.togglePause());
    this.restore.addEventListener('click', onRestore);
    devourer.onChange = state => this.update(state);
    devourer.notify();
  }

  updateMap() {
    if (!this.devourer.active) return;
    const player = this.devourer.group.position;
    this.mapPlayer.setAttribute('transform', `translate(${player.x} ${player.z})`);
    this.devourer.prey.forEach((body, index) => {
      const dot = this.mapDots[index];
      dot.setAttribute('cx', body.meshGroup.position.x);
      dot.setAttribute('cy', body.meshGroup.position.z);
      dot.style.display = body.isConsumed ? 'none' : '';
      dot.setAttribute('fill', body === this.devourer.target ? '#9affd7' : '#e5daff');
    });
  }

  update({ state, paused, eaten, total, target, canEat, distance }) {
    const idle = state === 'idle';
    const complete = state === 'complete';
    this.launch.hidden = !idle && !complete;
    this.launch.textContent = complete ? 'Play again' : 'Play as the monster';
    this.pause.hidden = idle || complete;
    this.pause.textContent = paused ? 'Resume' : 'Pause';
    this.pause.setAttribute('aria-pressed', String(paused));
    this.restore.hidden = idle;
    this.progress.setAttribute('aria-valuenow', String(eaten));
    this.progress.setAttribute('aria-valuetext', `${eaten} of ${total} worlds eaten`);
    this.progress.firstElementChild.style.width = `${total ? eaten / total * 100 : 0}%`;
    const action = state === 'swallow' ? 'Swallowing' : state === 'digest' ? 'Digesting' : 'Nearest';
    this.status.textContent = idle ? `Eat all ${total} worlds. Choose your own route.`
      : complete ? `You win! All ${total} worlds devoured.`
      : `${paused ? 'Paused' : action}${target ? ` · ${target}` : ''} — ${eaten}/${total} eaten`;
    this.caption.textContent = idle ? 'WASD to move · Enter to eat a nearby planet'
      : complete ? 'Play again or restore the solar system.'
      : paused ? 'Resume to keep playing · Esc to exit'
      : state === 'playing' ? `${canEat ? `Enter to eat ${target}!` : `Move ${distance} units closer to ${target}`} · WASD to move · Esc to exit`
      : 'Enjoy the bite… · Esc to exit';
    this.element.classList.toggle('devourer-ready', canEat);
    this.map.hidden = idle;
    document.getElementById('scroll-container').inert = !idle;
    document.body.classList.toggle('devourer-feeding', !idle);
  }
}
