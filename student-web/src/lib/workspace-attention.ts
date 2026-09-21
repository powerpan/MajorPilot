import type { Answer, InputProperty, InputSchema } from "../types/workspace";

export interface AttentionIssue { field: string; message: string }
type Field = InputProperty & { uniqueItems?: boolean };

/** Client guidance only. The server remains authoritative for completion. */
export function answerIssue(schema: InputSchema | undefined, answer: Answer, complete = true): AttentionIssue | null {
  if (!schema) return null;
  const visit = (field: Field, value: unknown, path: string, required: boolean): AttentionIssue | null => {
    const issue = (message: string) => ({ field: path, message });
    if (value === undefined || value === null) {
      if (!required) return null;
      // Repeated nested editors render empty rows before those rows exist in the answer.
      if (field.type === "object" && field.properties) return objectIssue(field, {}, path, true);
      if (field.type === "array" && field.items?.type === "object")
        return visit(field.items, {}, `${path}.0`, true);
      return issue(field.type === "boolean" ? "请先勾选确认这一项，再继续。" : field.type === "array" ? `请至少选择 ${field.minItems || 1} 项，再继续。` : "请完成这一项，再继续。");
    }
    if ("const" in field && value !== field.const) return issue(field.type === "boolean" ? "请先勾选确认这一项，再继续。" : "请核对这一项的选项后继续。");
    if (field.enum && !field.enum.includes(value as string | number)) return issue("请从当前可用选项中选择一项。");
    if (field.type === "string") {
      if (typeof value !== "string") return issue("请填写这一项。");
      const length = [...value].length;
      if (length < (field.minLength ?? 0)) return issue(`这里至少需要 ${field.minLength} 字，目前 ${length} 字。请补充后继续。`);
      if (length > (field.maxLength ?? Infinity)) return issue(`请将这一项缩短至 ${field.maxLength} 字以内。`);
    } else if (field.type === "boolean" && typeof value !== "boolean") return issue("请确认这一项。");
    else if (field.type === "number" || field.type === "integer") {
      if (typeof value !== "number" || !Number.isFinite(value)) return issue("请填写有效数字。");
      if (field.type === "integer" && !Number.isInteger(value)) return issue("这里需要整数，请调整后继续。");
      if (field.minimum !== undefined && value < field.minimum) return issue(`这里不能小于 ${field.minimum}。`);
      if (field.exclusiveMinimum !== undefined && value <= field.exclusiveMinimum) return issue(`这里需要大于 ${field.exclusiveMinimum}。`);
      if (field.maximum !== undefined && value > field.maximum) return issue(`这里不能超过 ${field.maximum}。`);
    } else if (field.type === "array") {
      if (!Array.isArray(value)) return issue("请完成这里的选择或记录。");
      if (value.length < (field.minItems ?? 0)) return issue(`这里至少需要 ${field.minItems} 项，目前 ${value.length} 项。`);
      if (value.length > (field.maxItems ?? Infinity)) return issue(`这里最多保留 ${field.maxItems} 项。`);
      if (field.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) return issue("这里有重复项，请调整后继续。");
      if (field.items) for (let index = 0; index < value.length; index++) {
        const nested = visit(field.items, value[index], `${path}.${index}`, true);
        if (nested) return nested;
      }
    } else if (field.type === "object") {
      if (typeof value !== "object" || Array.isArray(value)) return issue("请完成这里的设置。");
      return objectIssue(field, value as Answer, path, true);
    }
    return null;
  };
  const objectIssue = (field: Partial<InputSchema>, value: Answer, path: string, requireAll: boolean): AttentionIssue | null => {
    for (const [key, definition] of Object.entries(field.properties || {})) {
      const issue = visit(definition, value[key], path ? `${path}.${key}` : key, requireAll && !!field.required?.includes(key));
      if (issue) return issue;
    }
    return null;
  };
  return objectIssue(schema, answer, "", complete);
}

export function fieldNames(path: string): string[] {
  const nested = path.split(".");
  if (nested[0] === "findings" && nested.length >= 3) return [`finding-${nested[1]}-${nested[2]}`];
  if (nested[0] === "errorPatterns" && nested.length >= 3) return [nested[2] === "patternCode" ? `pattern-${nested[1]}` : nested[2] === "sampleIds" ? `pattern-sample-${nested[1]}` : `explanation-${nested[1]}`];
  if (nested[0] === "definitionVariantIds" && nested[1]) return [`definition-${nested[1]}`];
  return [path, nested[0]!];
}

/** Cross-field rules that have an unambiguous corresponding control. */
export function taskIssue(step: string, answer: Answer, bindings: Answer = {}): AttentionIssue | null {
  const issue = (field: string, message: string) => ({ field, message });
  if (step === 'd4-relationship') {
    if (answer.relationshipMode === 'GROUP_COMPLETION' && !answer.groupBy) return issue('groupBy', '请选择分组依据，再运行分析。');
    if (answer.relationshipMode === 'SCATTER') {
      if (!answer.xField) return issue('xField', '请选择横轴变量，再运行分析。');
      if (!answer.yField) return issue('yField', '请选择纵轴变量，再运行分析。');
      if (answer.xField === answer.yField) return issue('yField', '纵轴需要与横轴不同，请调整后重新运行。');
    }
  }
  if (step === 'd5-stratify' && bindings.relationshipMode === 'GROUP_COMPLETION' && answer.stratifyBy && answer.stratifyBy === bindings.groupBy)
    return issue('stratifyBy', '分层依据不能与已选分组相同，请选择另一项。');
  if (step === 'b2-metric') {
    const start = answer.baselineStartWeek, end = answer.baselineEndWeek, nextStart = answer.comparisonStartWeek, nextEnd = answer.comparisonEndWeek;
    if ([start, end, nextStart, nextEnd].every(value => typeof value === 'number' && Number.isFinite(value))) {
      if ((end as number) < (start as number)) return issue('baselineEndWeek', '基准批次的结束周不能早于开始周。');
      if ((nextEnd as number) < (nextStart as number)) return issue('comparisonEndWeek', '对比批次的结束周不能早于开始周。');
      if ((nextStart as number) <= (end as number)) return issue('comparisonStartWeek', '对比期须在基准期之后，两个批次范围不能重叠。');
      if ((end as number) - (start as number) !== (nextEnd as number) - (nextStart as number)) return issue('comparisonEndWeek', '两期必须包含相同周数，请调整对比期结束周。');
    }
  }
  if (step === 'reflection') for (const key of ['interestingStepKeys', 'difficultySources']) {
    const value = answer[key];
    if (Array.isArray(value) && value.includes('NONE') && value.length > 1) return issue(key, '“暂时没有／没有明显困难”不能与其他选项同时选择。');
  }
  return null;
}

export function attentionTarget(root: HTMLElement, field: string): HTMLElement | null {
  // Compare attributes rather than interpolating server-derived values into selectors.
  const marked = Array.from(root.querySelectorAll<HTMLElement>("[data-field-path]"));
  const exact = marked.find(element => element.dataset.fieldPath === field);
  if (exact) return exact;
  const names = fieldNames(field);
  const controls = Array.from(root.querySelectorAll<HTMLElement>("[name]"));
  for (const name of names) {
    const match = controls.find(element => element.getAttribute("name") === name);
    if (match) return match;
  }
  return marked.find(element => element.dataset.fieldPath === field.split(".")[0]) || null;
}

/** Owns only its inserted notice and temporary attributes; no answer or business-state writes. */
export function createAttention() {
  let cleanup: (() => void) | undefined;
  return {
    clear() { cleanup?.(); cleanup = undefined; },
    show(target: HTMLElement, message: string, invalid = true) {
      cleanup?.();
      for (let ancestor: HTMLElement | null = target; ancestor; ancestor = ancestor.parentElement)
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      const control = target.matches("input, select, textarea, button, summary") ? target : target.querySelector<HTMLElement>("[data-attention-control]:not(:disabled)") || target.querySelector<HTMLElement>("input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), summary") || target;
      const checkboxGroup = control.matches('input[type="checkbox"], input[type="radio"]') ? control.closest<HTMLElement>("fieldset") : null;
      const region = checkboxGroup || target.closest<HTMLElement>("[data-attention-region], label, fieldset") || target;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const innerScroller = /(auto|scroll)/.test(window.getComputedStyle(region).overflowY) && region.scrollHeight > region.clientHeight;
      const notice = document.createElement("p");
      notice.className = "workspace-attention-message";
      // Some task labels are two-column grids; guidance spans the complete field.
      notice.style.gridColumn = "1 / -1";
      notice.id = "workspace-action-guidance";
      notice.setAttribute("role", "alert");
      notice.textContent = message;
      // A capped choice list has its own scrollport. Appending below all choices
      // would hide the very explanation we are bringing into view.
      if (innerScroller) {
        region.prepend(notice);
        region.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
      } else region.append(notice);
      const previousDescription = control.getAttribute("aria-describedby"), previousInvalid = control.getAttribute("aria-invalid"), previousTabIndex = control.getAttribute("tabindex");
      control.setAttribute("aria-describedby", [previousDescription, notice.id].filter(Boolean).join(" "));
      if (invalid) control.setAttribute("aria-invalid", "true");
      if (!control.matches("input, select, textarea, button, summary, a[href]")) control.setAttribute("tabindex", "-1");
      control.focus({ preventScroll: true });
      (region.clientHeight > window.innerHeight / 2 ? control : region).scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "center", inline: "nearest" });
      void region.offsetWidth;
      region.classList.add("workspace-attention");
      cleanup = () => {
        notice.remove(); region.classList.remove("workspace-attention");
        for (const [attribute, value] of [["aria-describedby", previousDescription], ["aria-invalid", previousInvalid], ["tabindex", previousTabIndex]] as const) {
          if (value === null) control.removeAttribute(attribute); else control.setAttribute(attribute, value);
        }
      };
    },
  };
}
