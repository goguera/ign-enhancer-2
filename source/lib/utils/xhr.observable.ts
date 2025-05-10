import { XhrData, XhrEvent } from '@lib/types';
import { fromEvent } from 'rxjs';
import { map } from 'rxjs/operators';

export const xhrDataObservable = fromEvent<CustomEvent<XhrEvent>>(
  window,
  'getXhrData',
).pipe(map((event) => event.detail.data));

