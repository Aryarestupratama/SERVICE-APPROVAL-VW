import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/Components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Input password dengan toggle show/hide (icon mata).
 * Dipakai di Auth/Login.jsx dan Admin/Users/Index.jsx (form Add/Edit).
 */
const PasswordInput = forwardRef(({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
        <div className="relative">
            <Input
                {...props}
                ref={ref}
                type={visible ? 'text' : 'password'}
                className={cn('pr-10', className)}
            />
            <button
                type="button"
                tabIndex={-1}
                onClick={() => setVisible((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-vw-grey hover:text-foreground"
                aria-label={visible ? 'Hide password' : 'Show password'}
            >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
    );
});
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };