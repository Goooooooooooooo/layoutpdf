import type { DocumentAction, DocumentState } from './documentState.js';

export function inputReducer(
  state: DocumentState,
  action: DocumentAction,
): DocumentState {
  switch (action.type) {
    case 'input/update': {
      if (!state.inputs.records[action.recordIndex]) return state;
      const records = state.inputs.records.map((record, index) =>
        index === action.recordIndex ? { ...record, [action.key]: structuredClone(action.value) } : record
      );
      return { ...state, inputs: { ...state.inputs, records } };
    }
    case 'input/addRecord': {
      const records = [...state.inputs.records, {}];
      return { ...state, inputs: { records, activeRecordIndex: records.length - 1 } };
    }
    case 'input/deleteRecord': {
      if (state.inputs.records.length <= 1 || !state.inputs.records[action.index]) return state;
      const records = state.inputs.records.filter((_, index) => index !== action.index);
      const activeRecordIndex = state.inputs.activeRecordIndex > action.index
        ? state.inputs.activeRecordIndex - 1
        : state.inputs.activeRecordIndex === action.index
          ? Math.min(action.index, records.length - 1)
          : state.inputs.activeRecordIndex;
      return {
        ...state,
        inputs: {
          records,
          activeRecordIndex,
        },
      };
    }
    case 'input/activateRecord':
      return state.inputs.records[action.index]
        ? { ...state, inputs: { ...state.inputs, activeRecordIndex: action.index } }
        : state;
    default:
      return state;
  }
}