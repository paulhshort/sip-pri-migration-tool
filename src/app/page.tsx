import { Header } from '@/components/header'
import { MigrationForm } from '@/components/migration-form'
import { GenerationHistory } from '@/components/generation-history'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800">
      <Header />
      <main className="container mx-auto max-w-4xl px-4 py-8 space-y-8">
        <MigrationForm />
        <GenerationHistory />
      </main>
    </div>
  );
}
