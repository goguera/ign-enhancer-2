import { XhrData } from '@lib/types';
import { fromEvent } from 'rxjs';
import { map } from 'rxjs/operators';

export const xhrDataObservable = fromEvent<CustomEvent<{ data: XhrData }>>(
  window,
  'getXhrData',
).pipe(map((event) => event.detail.data));
