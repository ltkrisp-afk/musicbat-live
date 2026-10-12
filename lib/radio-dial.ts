import type { Category } from './radio-category';
import type { ChannelOption } from './shared-radio-engine';
export type DialState = { parent: Category | null; index: number };
const depth = (c: Category) => c.style ? 3 : c.subgenre ? 2 : 1;
export function dialChoices(options: ChannelOption[], state: DialState): ChannelOption[] {
 const level = state.parent ? depth(state.parent)+1 : 1;
 return options.filter(o => o.category && depth(o.category) === level &&
  (!state.parent || (o.category.genre === state.parent.genre &&
   (!state.parent.subgenre || o.category.subgenre === state.parent.subgenre))))
  .sort((a,b) => JSON.stringify(a.category).localeCompare(JSON.stringify(b.category)));
}
export function rotateDial(state: DialState, amount: number, count: number): DialState {
 if (!Number.isInteger(amount) || count < 1) return {...state,index:0};
 return {...state,index:((state.index+amount)%count+count)%count};
}
export function exploreDial(category: Category): DialState {
 return {parent:category,index:0};
}
export function backDial(state: DialState): DialState {
 const p=state.parent;
 return {parent:!p?.subgenre?null:{genre:p.genre},index:0};
}
