/**
 * Large, touch-friendly button for kiosk use.
 * Enforces a >=56px tap target, large type, playful colours and a pressed
 * animation. Three visual variants cover the whole app.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

type BigButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** Stretch to the full width of the container. */
  fullWidth?: boolean;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-300',
  secondary:
    'bg-white text-primary-700 border-2 border-primary-200 hover:bg-primary-50 focus-visible:ring-primary-200',
  danger:
    'bg-accent-600 text-white hover:bg-accent-700 focus-visible:ring-accent-300',
};

function BigButton({
  variant = 'primary',
  fullWidth = false,
  className = '',
  children,
  type = 'button',
  disabled,
  ...rest
}: BigButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        // Touch target + shape.
        'min-h-touch min-w-touch rounded-2xl px-8 py-4',
        // Type.
        'text-touch font-bold',
        // Interaction / motion.
        'shadow-lg transition-transform duration-100 ease-out',
        'active:scale-95 focus:outline-none focus-visible:ring-4',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:active:scale-100',
        fullWidth ? 'w-full' : '',
        VARIANT_CLASSES[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

export default BigButton;
