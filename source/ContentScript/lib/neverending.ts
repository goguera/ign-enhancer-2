let loadingNextPage: boolean = false;
let page: number = 1;

function loadPage(page: number): void {
    const location: string = window.location.href;
    if (location.split('/').pop()!.includes('page')) {
        return;
    }
    const url: string = `${location}page-${page}`;

    fetch(url, { method: 'GET' })
        .then(response => response.text())
        .then(data => injectNewThreads(data))
        .catch(error => console.log("Erro catando a próxima pagina:", error));
}

function injectNewThreads(pageDataString: string): void {
    const parser = new DOMParser();
    const doc = parser.parseFromString(pageDataString, "text/html");
    const threads = doc.querySelectorAll('.structItem--thread');
    let newThreads: string = "";
    threads.forEach(item => {
        newThreads += item.outerHTML;
    });

    const threadsTable: HTMLDivElement | null = document.querySelector('.js-threadList');
    if (threadsTable) {
        threadsTable.innerHTML += newThreads;
    }
    loadingNextPage = false;
}

function loadNextPage(): void {
    if (!loadingNextPage) {
        loadingNextPage = true;
        page++;
        loadPage(page);
    }
}

function injectNextPageButton(): void {
    const location: string = window.location.href;
    if (location.split('/').pop()!.includes('page')) {
        return;
    }
    const threadsEnd = document.querySelector('.block-outer--after') as HTMLElement;
    const buttonNewPage = document.createElement('button');
    buttonNewPage.style.width = '100%';
    buttonNewPage.style.height = '42px';
    buttonNewPage.id = 'newPageButton';
    buttonNewPage.textContent = 'Carregar nova página';
    buttonNewPage.addEventListener('click', loadNextPage);

    if (threadsEnd) {
        threadsEnd.parentNode!.insertBefore(buttonNewPage, threadsEnd);
    }
}

export function initNeverEnding(): void {
    injectNextPageButton();
}
