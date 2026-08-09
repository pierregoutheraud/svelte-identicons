import { cellIndexFromTarget } from "./paint-grid.dom.js";

/** Pointer and keyboard state for inspecting one cell in a delegated grid. */
export class PaintGridInspector {
	hoveredIndex = $state<number | null>(null);
	focusedIndex = $state<number | null>(null);

	get index(): number | null {
		return this.hoveredIndex ?? this.focusedIndex;
	}

	handlePointerOver = (event: PointerEvent) => {
		this.hoveredIndex = cellIndexFromTarget(event.target);
	};

	handlePointerLeave = () => {
		this.hoveredIndex = null;
	};

	handleFocusIn = (event: FocusEvent) => {
		const target = event.target;
		this.focusedIndex =
			target instanceof HTMLElement && target.matches(":focus-visible")
				? cellIndexFromTarget(target)
				: null;
	};

	handleFocusOut = () => {
		this.focusedIndex = null;
	};
}
