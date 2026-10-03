import InputError from '@/Components/InputError';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { PasswordInput } from '@/Components/ui/password-input';
import { Label } from '@/Components/ui/label';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';

export default function Login({ status }) {
    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
    });

    const submit = (e) => {
        e.preventDefault();

        post(route('login'), {
            onFinish: () => reset('password'),
        });
    };

    return (
        <GuestLayout>
            <Head title="Log in" />

            <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Sign in to your account
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Enter your email and password to access the admin panel.
            </p>

            {status && (
                <div role="status" className="mt-6 rounded-md border-l-4 border-approved bg-approved/5 px-4 py-3 text-sm font-medium text-approved">
                    {status}
                </div>
            )}

            <form onSubmit={submit} className="mt-8 space-y-5">
                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        name="email"
                        value={data.email}
                        autoComplete="username"
                        autoFocus
                        inputMode="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        onChange={(e) => setData('email', e.target.value)}
                    />
                    <InputError message={errors.email} />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <PasswordInput
                        id="password"
                        name="password"
                        value={data.password}
                        autoComplete="current-password"
                        onChange={(e) => setData('password', e.target.value)}
                    />
                    <InputError message={errors.password} />
                    <p className="text-xs text-muted-foreground">
                        {route().has('password.request') ? (
                            <Link href={route('password.request')} className="font-medium text-vw-blue hover:underline">
                                Forgot your password?
                            </Link>
                        ) : (
                            'Forgot your password? Ask an admin to reset it.'
                        )}
                    </p>
                </div>

                <Button type="submit" className="w-full" disabled={processing}>
                    {processing ? 'Signing in…' : 'Sign in'}
                </Button>
            </form>
        </GuestLayout>
    );
}