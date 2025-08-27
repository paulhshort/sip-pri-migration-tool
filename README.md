# SIP/PRI Migration Tool

A comprehensive web application for generating CSV files from Metaswitch ShadowDB queries to facilitate SIP/PRI migrations. This tool queries PBX lines and DID ranges from the ShadowDB and generates properly formatted CSV files for import into both Metaswitch and NetSapiens systems.

![Grid4 Logo](https://ambitious-coast-0a8b2110f.1.azurestaticapps.net/smartcomm_logo.svg)

## 🚀 Features

- **Intelligent Binding Search**: Autocomplete with fuzzy search across all 277+ SIP bindings in ShadowDB
- **Complete Data Retrieval**: Finds all PBX lines and related DID ranges using pattern matching
- **Dual CSV Generation**: Creates properly formatted files for both Metaswitch and NetSapiens systems
- **Real-time Progress Tracking**: Visual progress indicators during CSV generation
- **Generation History**: Track and re-download recent CSV generations
- **Auto-save Form Data**: Never lose your input with automatic form state persistence
- **Keyboard Shortcuts**: Power-user features with comprehensive keyboard navigation
- **Dark Mode Interface**: Professional Grid4-branded dark theme
- **Secure Database Access**: Read-only PostgreSQL queries with parameterized statements

## 📋 Prerequisites

- **Node.js** (v20 or higher)
- **pnpm** (recommended) or npm/yarn
- **PostgreSQL Database Access** to Metaswitch ShadowDB
- **Network Access** to the ShadowDB host (typically internal corporate network)

## 🛠️ Installation

### Option 1: Docker Deployment (Recommended)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/paulhshort/sip-pri-migration-tool.git
   cd sip-pri-migration-tool
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Deploy with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

4. **Access the application:**
   Open http://localhost:3000 in your browser

### Option 2: Manual Installation

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/paulhshort/sip-pri-migration-tool.git
   cd sip-pri-migration-tool
   pnpm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Build and start:**
   ```bash
   pnpm build
   pnpm start
   ```

## ⚙️ Configuration

### Environment Variables

The application requires the following environment variables:

```bash
# Database Configuration (Required)
DB_HOST=10.100.30.60          # ShadowDB host IP
DB_PORT=5432                   # PostgreSQL port
DB_NAME=shadow_config_db       # Database name
DB_USER=shadowconfigread       # Read-only username
DB_PASSWORD=your_password      # Database password

# Application Configuration (Optional)
PORT=3000                      # Application port
NODE_ENV=production           # Environment mode
```

### Database Requirements

The application requires **READ-ONLY** access to these ShadowDB tables:
- `meta_pbx_line` - For PBX directory numbers
- `meta_pbx_directinwardcalling` - For DID ranges

**Security Note**: Ensure the database user has only SELECT permissions for security.

## 📖 Usage

### Basic Operation

1. **Select SIP Binding**: Use the autocomplete field to search and select from 277+ available bindings
2. **Fill Form**: Enter NetSapiens domain, SIP trunk name, account number, and server location
3. **Generate CSVs**: Click "Generate CSVs" or press Ctrl+Enter
4. **Download Files**: Download both Metaswitch and NetSapiens CSV files

### Advanced Features

#### Keyboard Shortcuts
- `Ctrl + Enter` - Submit form
- `Ctrl + R` - Reset form
- `Ctrl + /` - Toggle keyboard shortcuts help
- `Escape` - Close results/modals

#### Auto-save
- Form data automatically saves to browser storage
- Resume where you left off after page reload
- Clear saved data with the trash icon

#### Generation History
- View last 10 CSV generations
- Re-download files from previous generations
- Track generation parameters and timestamps

## 🏗️ Architecture

### Technology Stack
- **Framework**: Next.js 15 with App Router
- **Database**: PostgreSQL with node-postgres
- **UI**: Tailwind CSS + shadcn/ui components
- **CSV Generation**: @fast-csv/format for streaming
- **Search**: Fuse.js for fuzzy binding search
- **Forms**: React Hook Form with Zod validation

### Data Flow
1. **Binding Search**: Query `meta_pbx_line` for unique SIP bindings
2. **PBX Lookup**: Find directory numbers by binding name
3. **DID Discovery**: Use pattern matching to find related DID ranges
4. **CSV Generation**: Create Metaswitch (ranges) and NetSapiens (individual) files
5. **File Delivery**: Secure direct file download with validation

## 📁 CSV Output Formats

### Metaswitch CSV
```csv
PBX DID Range or DISA Number,,,,,
MetaSphere CFS,PBX Phone number,(First) Phone number,Type,First code,Range size
Grid4-Liberty-CFS-1,2486877799,7347380285,DID range,7347380285,1
```

### NetSapiens CSV
```csv
Phone Number,Domain,Treatment,Destination,Notes,Enable
17347380285,example.com,SIP Trunk,examplepri,11399,yes
```

## 🔒 Security

- **Read-only Database Access**: Application uses SELECT-only database credentials
- **Input Validation**: All inputs validated and sanitized
- **Parameterized Queries**: SQL injection protection
- **File Access Control**: Secure file download with pattern validation
- **Network Isolation**: Designed for internal corporate network use

## 🐳 Docker Details

### Production Deployment
```bash
# Build production image
docker build -t sip-pri-tool .

# Run with environment file
docker run -d \
  --name sip-pri-tool \
  --env-file .env \
  -p 3000:3000 \
  -v ./data/output:/app/data/output \
  sip-pri-tool
```

### Health Checks
The Docker image includes health checks that verify application responsiveness.

## 🧪 Testing

```bash
# Run unit tests
pnpm test

# Run tests with UI
pnpm test:ui

# Type checking
pnpm type-check

# Linting
pnpm lint
```

## 📊 Monitoring

### Application Logs
- Structured JSON logging with pino
- Request/response logging for all API calls
- Database query logging with performance metrics

### Health Endpoints
- Application health check at `/`
- Database connectivity verification in logs

## 🔧 Troubleshooting

### Common Issues

**Database Connection Failed**
- Verify network access to ShadowDB host
- Check database credentials in .env
- Ensure read permissions on required tables

**CSV Generation Fails**
- Check SIP binding name (use autocomplete)
- Verify database contains expected data
- Review application logs for specific errors

**File Download Issues**
- Files are temporarily stored and cleaned up automatically
- Check disk space in `/data/output` directory
- Verify file permissions in Docker deployment

**Performance Issues**
- Large DID ranges (1000+ numbers) may take longer to process
- Consider database indexing on frequently queried columns
- Monitor memory usage for very large datasets

### Debugging

Enable detailed logging by setting `NODE_ENV=development` in your environment.

View real-time logs:
```bash
# Docker deployment
docker logs -f sip-pri-tool

# Manual deployment
pnpm dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is proprietary software developed for internal Grid4 use.

## 🆘 Support

For technical support or questions:
- Check the troubleshooting section above
- Review application logs for error details
- Contact the Grid4 development team

---

**Built with ❤️ by the Grid4 team for seamless SIP/PRI migrations**