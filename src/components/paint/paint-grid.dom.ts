export type IndexedClickHandler = (index: number) => void;
export interface ElementSize {
	width: number;
	height: number;
}
export type ElementSizeHandler = (size: ElementSize) => void;

export function cellIndexFromTarget(target: EventTarget | null): number | null {
	if (!(target instanceof Element)) return null;

	const cell = target.closest("[data-index]") as HTMLElement | null;
	if (!cell) return null;

	const index = Number(cell.dataset.index);
	return Number.isInteger(index) ? index : null;
}

/** Delegates clicks so large grids do not create a listener for every cell. */
export function delegateIndexedClick(
	node: HTMLElement,
	handler: IndexedClickHandler
) {
	let current = handler;

	function onClick(event: MouseEvent) {
		const index = cellIndexFromTarget(event.target);
		if (index !== null) current(index);
	}

	node.addEventListener("click", onClick);

	return {
		update(next: IndexedClickHandler) {
			current = next;
		},
		destroy() {
			node.removeEventListener("click", onClick);
		}
	};
}

/** Measures after layout so reactive size changes do not run inside observer delivery. */
export function observeElementSize(
	node: HTMLElement,
	handler: ElementSizeHandler
) {
	let current = handler;
	let frame = 0;
	let lastWidth = -1;
	let lastHeight = -1;

	function scheduleMeasurement() {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			const width = node.clientWidth;
			const height = node.clientHeight;
			if (width === lastWidth && height === lastHeight) return;

			lastWidth = width;
			lastHeight = height;
			current({ width, height });
		});
	}

	const observer = new ResizeObserver(scheduleMeasurement);
	observer.observe(node);
	scheduleMeasurement();

	return {
		update(next: ElementSizeHandler) {
			current = next;
			scheduleMeasurement();
		},
		destroy() {
			observer.disconnect();
			cancelAnimationFrame(frame);
		}
	};
}
