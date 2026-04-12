// 1. FORZAR LA RUTA DEL ARCHIVO .ENV
const path = require("path");
const dotenv = require('dotenv');

// Buscamos el archivo .env específicamente en la carpeta donde está este server.js
const result = dotenv.config({ path: path.join(__dirname, '.env') });

if (result.error) {
    console.error("❌ ERROR: No se pudo cargar el archivo .env. Verifica que el archivo existe en esta carpeta.");
} else {
    console.log("✅ Archivo .env cargado correctamente.");
}

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const cors = require("cors");
const CloudConvert = require('cloudconvert');

const app = express();

// --- DIAGNÓSTICO DE CLAVES ---
console.log("--- Estado de las Keys ---");
console.log("KEY_1:", process.env.KEY_1 ? "Detectada ✅" : "VACÍA ❌");
console.log("KEY_2:", process.env.KEY_2 ? "Detectada ✅" : "VACÍA ❌");
console.log("KEY_3:", process.env.KEY_3 ? "Detectada ✅" : "VACÍA ❌");
console.log("KEY_4:", process.env.KEY_4 ? "Detectada ✅" : "VACÍA ❌");
console.log("KEY_5:", process.env.KEY_5 ? "Detectada ✅" : "VACÍA ❌");


// --- API Keys (Failover) ---
const API_KEYS = [ 
    process.env.KEY_1,
    process.env.KEY_2,
    process.env.KEY_3,
    process.env.KEY_4,
    process.env.KEY_5
].filter(key => key); // Elimina las que no existan

const upload = multer({ dest: 'uploads/' });
app.use(cors());
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function runConversion(inputPath, fileName, type, keyIndex = 0) {
    if (keyIndex >= API_KEYS.length) throw new Error("Todas las API Keys fallaron o están vacías.");

    const cc = new CloudConvert(API_KEYS[keyIndex]);
    
    let outputFormat = 'pdf'; 
    if (type === 'pdfword') outputFormat = 'docx';
    if (type === 'pdfexcel') outputFormat = 'xlsx';
    if (type === 'pdfppt') outputFormat = 'pptx';
    if (type === 'image' || type === 'office') outputFormat = 'pdf';

    try {
        const job = await cc.jobs.create({
            tasks: {
                'import-it': { operation: 'import/upload' },
                'convert-it': { 
                    operation: 'convert', 
                    input: 'import-it', 
                    output_format: outputFormat 
                },
                'export-it': { operation: 'export/url', input: 'convert-it' }
            }
        });

        const uploadTask = job.tasks.find(t => t.name === 'import-it');
        await cc.tasks.upload(uploadTask, fs.createReadStream(inputPath), fileName);

        const finishedJob = await cc.jobs.wait(job.id);
        const exportTask = finishedJob.tasks.find(t => t.name === 'export-it');
        
        return exportTask.result.files[0].url;
    } catch (err) {
        console.error(`Fallo en Key ${keyIndex + 1}: ${err.message}`);
        return await runConversion(inputPath, fileName, type, keyIndex + 1);
    }
}

app.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });

    const type = req.body.type; 
    try {
        const fileUrl = await runConversion(req.file.path, req.file.originalname, type);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.json({ url: fileUrl });
    } catch (err) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log("Servidor en: http://localhost:3000"));