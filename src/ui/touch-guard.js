// @ts-check
// iOS bounces the whole page when a drag has nothing left to scroll, whatever the CSS says, so such a drag is
// cancelled here, and it ignores the viewport's no-zoom setting, so pinches are too. Drags an element can still
// take are left alone.

const SCROLLS = new Set(['auto', 'scroll']);

/**
 * @param {Element} element
 * @param {number} dx
 * @param {number} dy
 */
function takesDrag(element, dx, dy) {
  const style = getComputedStyle(element);
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (!SCROLLS.has(style.overflowY)) return false;
    // Finger down moves the content down, towards its start.
    return dy > 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  }
  if (!SCROLLS.has(style.overflowX)) return false;
  return dx > 0 ? element.scrollLeft > 0 : element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
}

/**
 * @param {Element} target
 * @param {number} dx
 * @param {number} dy
 */
function anyTakesDrag(target, dx, dy) {
  /** @type {Element | null} */
  let element = target;
  while (element) {
    if (takesDrag(element, dx, dy)) return true;
    // Nothing behind an open dialog should scroll.
    if (element instanceof HTMLDialogElement) return false;
    element = element.parentElement;
  }
  return false;
}

export function installTouchGuard() {
  let lastX = 0;
  let lastY = 0;
  document.addEventListener('touchstart', event => {
    lastX = event.touches[0].clientX;
    lastY = event.touches[0].clientY;
  }, {passive: true});
  document.addEventListener('touchmove', event => {
    if (!event.cancelable) return;
    if (event.touches.length > 1) {
      event.preventDefault();
      return;
    }
    const {clientX, clientY} = event.touches[0];
    const dx = clientX - lastX;
    const dy = clientY - lastY;
    lastX = clientX;
    lastY = clientY;
    if (!dx && !dy) return;
    const target = /** @type {Element} */ (event.target);
    // Sliders and text fields handle their own drags.
    if (target.closest('input,textarea,select')) return;
    if (!anyTakesDrag(target, dx, dy)) event.preventDefault();
  }, {passive: false});
  // Safari's own pinch event.
  document.addEventListener('gesturestart', event => event.preventDefault());
}
