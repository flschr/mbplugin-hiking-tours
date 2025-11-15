(function () {
  const sections = Array.from(document.querySelectorAll('[data-peak-path]'));
  if (!sections.length) {
    return;
  }

  const animatorMap = new Map();
  const resizeObserver = typeof window.ResizeObserver === 'function'
    ? new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          const animator = animatorMap.get(entry.target);
          if (animator) {
            animator.schedule();
          }
        });
      })
    : null;

  class PeakPathAnimator {
    constructor(section) {
      this.section = section;
      this.wrapper = section.querySelector('[data-peak-path-wrapper]') || section;
      this.svg = section.querySelector('.tour-peak-path');
      this.pathEl = this.ensurePathElement();
      this.chips = Array.from(section.querySelectorAll('[data-peak-chip]'));
      this.raf = null;
    }

    ensurePathElement() {
      if (!this.svg) {
        return null;
      }
      let path = this.svg.querySelector('path');
      if (!path) {
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('tour-peak-path-line');
        this.svg.appendChild(path);
      }
      return path;
    }

    schedule() {
      if (!this.pathEl || this.raf) {
        return;
      }
      this.raf = window.requestAnimationFrame(() => {
        this.raf = null;
        this.update();
      });
    }

    update() {
      if (!this.wrapper || !this.pathEl) {
        return;
      }

      const rect = this.wrapper.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        this.pathEl.removeAttribute('d');
        return;
      }

      const points = this.chips
        .map((chip) => {
          const chipRect = chip.getBoundingClientRect();
          return {
            x: chipRect.left - rect.left + chipRect.width / 2,
            y: chipRect.top - rect.top + chipRect.height / 2,
          };
        })
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

      if (points.length < 2) {
        this.pathEl.removeAttribute('d');
        return;
      }

      const d = this.buildPath(points);
      this.svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
      this.svg.setAttribute('width', rect.width);
      this.svg.setAttribute('height', rect.height);
      this.pathEl.setAttribute('d', d);

      const dash = Math.max(28, rect.width / 12);
      this.pathEl.setAttribute('stroke-dasharray', `${dash} ${dash * 0.7}`);
      this.pathEl.setAttribute('stroke-linecap', 'round');
      this.pathEl.style.setProperty('--tour-peak-dash', dash.toFixed(2));
    }

    buildPath(points) {
      let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
      for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        const jitter = this.jitterAmount();
        const ctrlX = midX + jitter * (Math.random() - 0.5);
        const ctrlY = midY + jitter * (Math.random() - 0.5);
        d += ` Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
      }
      return d;
    }

    jitterAmount() {
      const base = this.wrapper.clientWidth * 0.05;
      return Math.min(40, Math.max(12, base));
    }
  }

  sections.forEach((section) => {
    const animator = new PeakPathAnimator(section);
    if (!animator.pathEl) {
      return;
    }
    animatorMap.set(animator.wrapper, animator);
    animator.schedule();
    if (resizeObserver) {
      resizeObserver.observe(animator.wrapper);
    }
  });

  const scheduleAll = () => {
    animatorMap.forEach((animator) => animator.schedule());
  };

  window.addEventListener('resize', scheduleAll);

  if (!resizeObserver) {
    window.addEventListener('orientationchange', scheduleAll);
  }
})();
