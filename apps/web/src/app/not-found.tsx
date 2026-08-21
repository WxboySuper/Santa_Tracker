export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-900 text-white p-8">
      <h1 className="text-4xl font-bold mb-4">Page Not Found</h1>
      <p className="opacity-80 mb-4">The page you&apos;re looking for doesn&apos;t exist.</p>
      <a href="/" className="bg-white text-blue-900 px-6 py-2 rounded-full font-semibold">Go Home</a>
    </div>
  );
}
