interface PendingConfirmation {
  id: string;
  resolve: (confirmed: boolean) => void;
}

class ConfirmationManager {
  private pendingConfirmations = new Map<string, PendingConfirmation>();

  async showConfirmation(
    title: string,
    message: string,
    confirmText = 'Yes, proceed',
    cancelText = 'Cancel'
  ): Promise<boolean> {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

    return new Promise((resolve) => {
      this.pendingConfirmations.set(id, { id, resolve });

      figma.ui.postMessage({
        type: 'show-confirmation',
        id,
        title,
        message,
        confirmText,
        cancelText
      });
    });
  }

  handleResponse(id: string, confirmed: boolean) {
    const pending = this.pendingConfirmations.get(id);
    if (pending) {
      pending.resolve(confirmed);
      this.pendingConfirmations.delete(id);
    }
  }
}

export const confirmationManager = new ConfirmationManager();
