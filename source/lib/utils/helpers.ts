export function injectScript(file: string, node: string) {
  var th = document.getElementsByTagName(node)[0];
  var s = document.createElement('script');
  s.setAttribute('type', 'text/javascript');
  s.setAttribute('src', file);
  th.appendChild(s);
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type CreateButtonOptions = {
  text: string;
  style?: Partial<CSSStyleDeclaration>;
  id: string;
  callback: () => void;
};

export function createButton(options: CreateButtonOptions): HTMLButtonElement {
  const { id, text, style, callback } = options;
  const button = document.createElement('button');
  button.textContent = text;
  button.id = "ign-enhancer-" + id;
  if (style) {
    Object.assign(button.style, style);
  }
  button.addEventListener('click', callback);
  return button;
}
