import { THREAD_CLASS } from '@lib/utils/constants';
import { BehaviorSubject, combineLatest, map } from 'rxjs';

let cachedThreads: HTMLElement[] = [];


export let page: number = 1;

export let pageObservable = new BehaviorSubject<number>(1);
export let threadsLoadedObservable = new BehaviorSubject<number>(0);
export let threadsLoadedVisibleObservable = new BehaviorSubject<number>(0);

export const threadsObservable = new BehaviorSubject<HTMLElement[]>(cachedThreads);

// Automatically update threadsLoaded and threadsLoadedVisible when threads change
threadsObservable.subscribe((threads) => {
  threadsLoadedObservable.next(threads.length);
  threadsLoadedVisibleObservable.next(
    threads.filter((thread) => thread.style.display !== 'none').length,
  );
});

// Combine latest values from page, threadsLoaded, and threadsLoadedVisible
export const countersObservable = combineLatest([
  pageObservable,
  threadsLoadedObservable,
  threadsLoadedVisibleObservable,
]).pipe(
  map(([page, threadsLoaded, threadsLoadedVisible]) => ({
    page,
    threadsLoaded,
    threadsLoadedVisible,
  })),
);

function getThreads(): HTMLElement[] {
  const threads = document.getElementsByClassName(THREAD_CLASS);
  const threadsArray = Array.from(threads, (thread) => thread as HTMLElement);

  if (!cachedThreads.length || threads.length !== cachedThreads.length) {
    cachedThreads = threadsArray;
    threadsObservable.next(cachedThreads); // Emit new value through BehaviorSubject
  }
  return cachedThreads;
}

export function updatePage(newPage: number): void {
  pageObservable.next(newPage); // Correctly emit changes to the page
  page = newPage; // Update the global variable
}

export function isThreadPostedByMe(thread: HTMLElement): boolean {
  // Look for the specific span element with class 'avatar--separated' within the thread
  const myAvatarSpan = thread.querySelector('span.avatar--separated');
  return myAvatarSpan !== null;
}

function setDisplayProperty(
  threads: HTMLElement[],
  displayStyle: string,
  classNameFilter?: string,
) {
  threads.forEach((thread) => {
    if (!classNameFilter || thread.className.includes(classNameFilter)) {
      thread.style.display = displayStyle;
    }
  });
}

export function hideAllThreads() {
  setDisplayProperty(getThreads(), 'none');
}

export function showAllThreads() {
  setDisplayProperty(getThreads(), '');
}

export function hideThreadsByClassName(className: string) {
  setDisplayProperty(getThreads(), 'none', className);
}

export function showThreadsByClassName(className: string) {
  setDisplayProperty(getThreads(), '', className);
}

export function hideAllPostedByMe() {
  for (const thread of getThreads()) {
    if (isThreadPostedByMe(thread)) {
      thread.style.display = 'none';
    }
  }
}

export function loadMoreThreadsUntilLimit(limit: number) {
  const threads = getThreads(); // Ensure the latest threads are always fetched

  // Use Array.from to convert the live collection to an array for processing
  const visibleThreads = Array.from(threads).filter((thread) => {
    // Directly check the computed style to determine if the thread is visible
    return window.getComputedStyle(thread).display !== 'none';
  });

  if (visibleThreads.length < limit) {
    loadNextPage(); // Function to load more threads
    setTimeout(() => loadMoreThreadsUntilLimit(limit), 1000); // Check again after a delay
  }
}

export function showAllPostedByMe() {
  for (const thread of getThreads()) {
    if (isThreadPostedByMe(thread)) {
      thread.style.display = '';
    }
  }
}

export let loadingNextPage: boolean = false;

function loadPage(page: number): void {
  const location: string = window.location.href;
  if (location.split('/').pop()?.includes('page')) {
    return;
  }
  const url: string = `${location}page-${page}`;

  fetch(url, { method: 'GET' })
    .then((response) => response.text())
    .then((data) => injectNewThreads(data))
    .then(() => getThreads()) // Update the threads after the new ones are injected
    .catch((error) => console.log('Erro catando a próxima pagina:', error));
}

function injectNewThreads(pageDataString: string): void {
  const parser = new DOMParser();
  const doc = parser.parseFromString(pageDataString, 'text/html');
  const threads = doc.querySelectorAll('.structItem--thread');
  let newThreads: string = '';
  threads.forEach((item) => {
    newThreads += item.outerHTML;
  });

  const threadsTable: HTMLDivElement | null = document.querySelector('.js-threadList');
  if (threadsTable) {
    threadsTable.innerHTML += newThreads;
  }
  loadingNextPage = false;
}

export function loadNextPage(): void {
  if (!loadingNextPage) {
    loadingNextPage = true;
    page++;
    updatePage(page);
    loadPage(page);
  }
}


getThreads(); // Initial fetch of threads
