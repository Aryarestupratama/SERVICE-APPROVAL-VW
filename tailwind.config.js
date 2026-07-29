import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.jsx',
    ],

    theme: {
        extend: {
        fontFamily: {
            sans: ['Inter', ...defaultTheme.fontFamily.sans],
        },
        colors: {
            'vw-blue': '#001E50',
            'vw-light-blue': '#00B0F0',
            'vw-grey': '#767676',
            'vw-grey-light': '#F2F2F2',
            urgent: '#D32F2F',
            approved: '#2E7D32',
        },
        },
    },

    plugins: [forms],
};
