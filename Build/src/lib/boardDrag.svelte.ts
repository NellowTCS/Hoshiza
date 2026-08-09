import { moveRepo } from './state.svelte';

/**
 * Shared state for the touch long-press card drag
 */
export const drag = $state<{
	repoId: string | null;
	clientX: number;
	clientY: number;
	width: number;
	height: number;
	overStatus: string | null;
	overIndex: number | null;
	suppressClick: boolean;
}>({
	repoId: null,
	clientX: 0,
	clientY: 0,
	width: 0,
	height: 0,
	overStatus: null,
	overIndex: null,
	suppressClick: false
});

const HOLD_MS = 500;
const MOVE_TOLERANCE = 10;
const EDGE_PX = 56;
const SCROLL_STEP = 12;

let pointerId = -1;
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let startX = 0;
let startY = 0;
let active = false;
// True once the finger has travelled enough during the drag to count as a
// move; a held-and-released long-press must not reorder (or autosync).
let dragged = false;
let raf = 0;

/** Cancels browser scrolling while the drag owns the gesture. Also drives the
 * drag position from touchmove as a fallback for engines that stop delivering
 * pointermove after setPointerCapture. */
function blockScroll(e: TouchEvent): void {
	if (!active) return;
	e.preventDefault();
	const t = e.touches[0];
	if (t) {
		drag.clientX = t.clientX;
		drag.clientY = t.clientY;
		hitTest();
		if (!dragged && (Math.abs(t.clientX - startX) + Math.abs(t.clientY - startY) > 4)) {
			dragged = true;
		}
	}
}

/** Resolve the column under the pointer and the insertion index within it. */
function hitTest(): void {
	const el = document.elementFromPoint(drag.clientX, drag.clientY) as HTMLElement | null;
	const col = el?.closest?.('[data-status]') as HTMLElement | null;
	if (!col || !drag.repoId) {
		drag.overStatus = null;
		drag.overIndex = null;
		return;
	}
	drag.overStatus = col.dataset.status ?? null;
	// The source card stays in the DOM (dimmed, not removed), so exclude it when
	// turning the pointer's Y into an insertion index.
	const cards = [...col.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
		(c) => c.dataset.cardId !== drag.repoId
	);
	let idx = cards.length;
	for (let i = 0; i < cards.length; i++) {
		const r = cards[i].getBoundingClientRect();
		if (drag.clientY < r.bottom) {
			idx = drag.clientY < r.top + r.height / 2 ? i : i + 1;
			break;
		}
	}
	drag.overIndex = idx;
}

/** Auto-scroll the column row and the hovered column list while pinned to an edge. */
function edgeStep(): void {
	if (!active || !drag.repoId) {
		raf = 0;
		return;
	}
	const cols = document.querySelector<HTMLElement>('.cols');
	if (cols) {
		const r = cols.getBoundingClientRect();
		if (drag.clientX < r.left + EDGE_PX) cols.scrollLeft -= SCROLL_STEP;
		else if (drag.clientX > r.right - EDGE_PX) cols.scrollLeft += SCROLL_STEP;
	}
	if (drag.overStatus) {
		const col = document.querySelector<HTMLElement>(
			`[data-status="${CSS.escape(drag.overStatus)}"]`
		);
		const list = col?.querySelector<HTMLElement>('.list');
		if (list) {
			const r = list.getBoundingClientRect();
			if (drag.clientY < r.top + EDGE_PX) list.scrollTop -= SCROLL_STEP;
			else if (drag.clientY > r.bottom - EDGE_PX) list.scrollTop += SCROLL_STEP;
		}
	}
	raf = requestAnimationFrame(edgeStep);
}

function engage(e: PointerEvent, node: HTMLElement): void {
	const r = node.getBoundingClientRect();
	drag.repoId = node.dataset.cardId ?? null;
	drag.clientX = e.clientX;
	drag.clientY = e.clientY;
	drag.width = r.width;
	drag.height = r.height;
	drag.overStatus = null;
	drag.overIndex = null;
	active = true;
	dragged = false;
	try {
		node.setPointerCapture(pointerId);
	} catch {
		// capture is advisory; the document-level touchmove guard still holds
	}
	document.body.classList.add('hoshiza-dragging');
	window.addEventListener('touchmove', blockScroll, { passive: false });
	hitTest();
	raf = requestAnimationFrame(edgeStep);
}

function finish(): void {
	const id = drag.repoId;
	const to = drag.overStatus;
	const at = drag.overIndex;
	cleanup();
	if (id && to && dragged) moveRepo(id, to, at ?? undefined);
}

function cleanup(): void {
	active = false;
	clearTimeout(holdTimer);
	document.body.classList.remove('hoshiza-dragging');
	window.removeEventListener('touchmove', blockScroll);
	drag.repoId = null;
	drag.overStatus = null;
	drag.overIndex = null;
	pointerId = -1;
}

function cancel(): void {
	clearTimeout(holdTimer);
	active = false;
}

/** Svelte action for RepoCard: owns the long-press gesture lifecycle. */
export function longPressDrag(node: HTMLElement): { destroy: () => void } {
	function onPointerDown(e: PointerEvent): void {
		if (drag.repoId || (e.pointerType !== 'touch' && e.pointerType !== 'pen')) return;
		drag.suppressClick = false;
		pointerId = e.pointerId;
		startX = e.clientX;
		startY = e.clientY;
		holdTimer = setTimeout(() => engage(e, node), HOLD_MS);
	}
	function onPointerMove(e: PointerEvent): void {
		if (e.pointerId !== pointerId) return;
		if (active) {
			drag.clientX = e.clientX;
			drag.clientY = e.clientY;
			hitTest();
			if (!dragged && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 4) {
				dragged = true;
			}
			return;
		}
		if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > MOVE_TOLERANCE) cancel();
	}
	function onPointerUp(e: PointerEvent): void {
		if (e.pointerId !== pointerId) return;
		const wasActive = active;
		if (wasActive) {
			// A released long-press would otherwise click through to the repo link
			// or the detail sheet; the capture-phase click handler below swallows
			// exactly the click that follows.
			drag.suppressClick = true;
			finish();
		} else {
			cancel();
		}
	}
	function onPointerCancel(): void {
		if (active) cleanup();
		else cancel();
	}
	function onCaptureClick(e: Event): void {
		if (drag.suppressClick) {
			e.preventDefault();
			e.stopImmediatePropagation();
			drag.suppressClick = false;
		}
	}

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('pointermove', onPointerMove);
	node.addEventListener('pointerup', onPointerUp);
	node.addEventListener('pointercancel', onPointerCancel);
	node.addEventListener('click', onCaptureClick, true);

	return {
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', onPointerUp);
			node.removeEventListener('pointercancel', onPointerCancel);
			node.removeEventListener('click', onCaptureClick, true);
			if (active) cleanup();
		}
	};
}
