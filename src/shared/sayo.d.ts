/** Sayo UI global — loaded via <script src="/sayo.js"> in vocab/index.html */
declare const Sayo: {
  cursor: { init(opts?: Record<string, number>): void; destroy(): void };
  trail: { init(opts?: Record<string, unknown>): void; destroy(): void };
  toast: {
    show(msg: string, opts?: {
      type?: 'success' | 'error' | 'info' | 'warning';
      duration?: number;
    }): void;
  };
  dialog: {
    confirm(opts: {
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
    }): Promise<boolean>;
  };
};
