export const toast = $state({ message: '' });

let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string) {
	toast.message = message;
	clearTimeout(timer);
	timer = setTimeout(() => (toast.message = ''), 3500);
}
