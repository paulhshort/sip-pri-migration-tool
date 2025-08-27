import Image from 'next/image'

export function Header() {
  return (
    <header className="border-b border-gray-700 bg-gray-800 shadow-lg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-6">
          <div className="flex items-center space-x-4">
            <Image
              src="https://ambitious-coast-0a8b2110f.1.azurestaticapps.net/smartcomm_logo.svg"
              alt="SmartComm Logo"
              width={160}
              height={40}
              className="h-10 w-auto filter brightness-0 invert"
            />
            <div className="h-8 w-px bg-gray-600" />
            <div>
              <h1 className="text-2xl font-bold text-white">SIP/PRI Migration Tool</h1>
              <p className="text-sm text-gray-400">Generate CSV files for Metaswitch and NetSapiens import</p>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-2">
            <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-400">Shadow DB Connected</span>
          </div>
        </div>
      </div>
    </header>
  )
}