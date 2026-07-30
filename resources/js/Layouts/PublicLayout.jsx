export default function PublicLayout({ children }) {
    return (
        <div className="min-h-screen bg-white font-sans text-gray-900 antialiased">
            {children}
        </div>
    );
}