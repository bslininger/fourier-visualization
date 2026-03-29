/// <reference types="vite/client" />

declare module "katex/contrib/auto-render" {
  interface Options {
    delimiters?: { left: string; right: string; display: boolean }[];
  }

  function renderMathInElement(element: HTMLElement, options?: Options): void;

  export default renderMathInElement;
}