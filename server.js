const express = require("express");
const mysql   = require("mysql2");
const cors    = require("cors");
require("dotenv").config();
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const https   = require("https");
const crypto  = require("crypto");
const nodemailer = require("nodemailer");
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ══ MYSQL ══ */
const db = mysql.createConnection({
  host: "localhost", user: "root", password: "", database: "gestion_stages_v"
});
db.connect(err => {
  if (err) console.log("Erreur MySQL:", err.message);
  else     console.log("✅ MySQL connecté");
});
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "thabetyasmine387@gmail.com",
    pass: process.env.EMAIL_PASS
  }
});
const resetCodes = {};
/* ═══════════════════════════════ */
/* ✅ 1. SEND CODE */
/* ═══════════════════════════════ */
app.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  db.query("SELECT * FROM utilisateur WHERE email=?", [email], (err, result) => {
    if (err || result.length === 0) {
      return res.json({ success: false, message: "Email introuvable" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    resetCodes[email] = {
      code,
      expires: Date.now() + 5 * 60 * 1000
    };

    transporter.sendMail({
      from: "StageFlow",
      to: email,
      subject: "Code de récupération",
      text: `Votre code est: ${code}`
    }, (err) => {
      if (err) {
        console.log("Erreur email:", err);
        return res.json({ success: false });
      }
      res.json({ success: true });
    });
  });
});

/* ═══════════════════════════════ */
/* ✅ 2. VERIFY CODE */
/* ═══════════════════════════════ */
app.post("/verify-code", (req, res) => {
  const { email, code } = req.body;

  const stored = resetCodes[email];

  if (!stored) {
    return res.json({ success: false });
  }

  if (stored.code !== code) {
    return res.json({ success: false });
  }

  if (Date.now() > stored.expires) {
    delete resetCodes[email];
    return res.json({ success: false, message: "Code expiré" });
  }

  res.json({ success: true });
});

/* ═══════════════════════════════ */
/* ✅ 3. RESET PASSWORD */
/* ═══════════════════════════════ */
app.post("/reset-password", (req, res) => {
  const { email, password } = req.body;

  if (!resetCodes[email]) {
    return res.json({ success: false });
  }

  db.query("UPDATE utilisateur SET password=? WHERE email=?",
    [password, email],
    (err) => {
      if (err) return res.json({ success: false });

      delete resetCodes[email];
      res.json({ success: true });
    });
});
/* ══ UPLOADS FOLDERS ══ */
const uploadFolder    = path.join(__dirname, "uploads");
const audioFolder     = path.join(uploadFolder, "audio");
const stageFolder     = path.join(uploadFolder, "stages");
const ressourceFolder = path.join(uploadFolder, "ressources");

[uploadFolder, audioFolder, stageFolder, ressourceFolder].forEach(f => {
  if (!fs.existsSync(f)) fs.mkdirSync(f, { recursive: true });
});

/* ══ MULTER CONFIGS ══ */
const uploadAudio = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, audioFolder),
  filename:    (req, file, cb) => cb(null, Date.now() + ".webm")
})});

const uploadFile = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadFolder),
  filename:    (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
})});

const uploadRapport = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, stageFolder),
  filename:    (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
})});

const uploadPhoto = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadFolder),
  filename:    (req, file, cb) => cb(null, "photo-" + Date.now() + path.extname(file.originalname))
}), limits: { fileSize: 5 * 1024 * 1024 }});

const uploadRessource = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, ressourceFolder),
  filename:    (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
})});

/* ══ TYPING (in-memory) ══ */
const typingStatus = {};

app.post("/typing", (req, res) => {
  const { from_id, to_id } = req.body;
  if (!typingStatus[from_id]) typingStatus[from_id] = {};
  typingStatus[from_id][to_id] = Date.now();
  res.json({ success: true });
});

app.get("/typing/:from_id/:to_id", (req, res) => {
  const { from_id, to_id } = req.params;
  const ts = typingStatus[from_id]?.[to_id];
  const is_typing = ts && (Date.now() - ts) < 3000;
  if (!is_typing && typingStatus[from_id]) delete typingStatus[from_id][to_id];
  res.json({ is_typing: !!is_typing });
});

/* ══ LOGIN ══ */
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  db.query("SELECT * FROM utilisateur WHERE email=? AND password=?", [email, password], (err, result) => {
    if (err) return res.json({ success: false, message: "Erreur serveur" });
   if (result.length > 0) {

  const user = result[0];

  // 📧 إرسال email
  transporter.sendMail({
    from: "your_email@gmail.com",
    to: user.email,
    subject: "Connexion réussie",
    text: "Vous êtes connecté avec succès à StageFlow"
  }, (err, info) => {
    if (err) {
      console.log("Erreur email:", err);
    } else {
      console.log("Email envoyé:", info.response);
    }
  });

  res.json({ success: true, user });

}
    else res.json({ success: false, message: "Email ou mot de passe incorrect" });
  });
});

/* ══ PROFIL ══ */
app.get("/profil/:email", (req, res) => {
  db.query("SELECT nom, prenom, email, telephone, photo FROM utilisateur WHERE email=?",
    [req.params.email], (err, result) => {
      if (err || result.length === 0) return res.json({ success: false });
      res.json(result[0]);
    });
});

app.get("/profil-complet/:id", (req, res) => {
  const sql = `
    SELECT u.id, u.nom, u.prenom, u.email, u.telephone, u.photo, u.role,
           u.departement_id,
           d.nom AS departement,
           e.num_etudiant, e.filiere, e.type_stage
    FROM utilisateur u
    LEFT JOIN departement d ON u.departement_id = d.id
    LEFT JOIN etudiant e ON e.utilisateur_id = u.id
    WHERE u.id = ?
  `;
  db.query(sql, [req.params.id], (err, result) => {
    if (err || result.length === 0) return res.json({ success: false });
    res.json({ success: true, user: result[0] });
  });
});

app.put("/update-profil", (req, res) => {
  const { user_id, prenom, nom, telephone } = req.body;
  db.query("UPDATE utilisateur SET prenom=?, nom=?, telephone=? WHERE id=?",
    [prenom, nom, telephone, user_id], err => {
      if (err) return res.json({ success: false });
      res.json({ success: true });
    });
});

app.put("/change-password", (req, res) => {
  const { user_id, old_password, new_password } = req.body;
  db.query("SELECT id FROM utilisateur WHERE id=? AND password=?", [user_id, old_password], (err, result) => {
    if (err) return res.json({ success: false });
    if (result.length === 0) return res.json({ success: false, message: "Mot de passe actuel incorrect" });
    db.query("UPDATE utilisateur SET password=? WHERE id=?", [new_password, user_id], err2 => {
      if (err2) return res.json({ success: false });
      res.json({ success: true });
    });
  });
});

app.post("/upload-photo", uploadPhoto.single("photo"), (req, res) => {
  if (!req.file) return res.json({ success: false });
  db.query("UPDATE utilisateur SET photo=? WHERE id=?", [req.file.filename, req.body.user_id], err => {
    if (err) return res.json({ success: false });
    res.json({ success: true, filename: req.file.filename });
  });
});

/* ══ USER INFO ══ */
app.get("/user-info/:id", (req, res) => {
  db.query("SELECT id, nom, prenom, photo, role FROM utilisateur WHERE id=?",
    [req.params.id], (err, result) => {
      if (err || result.length === 0) return res.json({ success: false });
      res.json({ success: true, user: result[0] });
    });
});

app.get("/user-type-stage/:id", (req, res) => {
  db.query("SELECT type_stage FROM etudiant WHERE utilisateur_id=?",
    [req.params.id], (err, result) => {
      if (err || result.length === 0) return res.json({ success: false });
      res.json({ success: true, type_stage: result[0].type_stage });
    });
});

/* ══ MON ENCADRANT ══ */
app.get("/mon-encadrant/:etudiant_id", (req, res) => {
  const sql = `
    SELECT u.id, u.nom, u.prenom, u.photo, u.role, s.id AS stage_id
    FROM stage s
    JOIN utilisateur u ON s.encadrant_id = u.id
    WHERE s.etudiant_id = ? AND s.statut != 'refuse'
    LIMIT 1
  `;
  db.query(sql, [req.params.etudiant_id], (err, result) => {
    if (err || result.length === 0) return res.json({ success: false });
    res.json({ success: true, encadrant: result[0] });
  });
});

/* ══ ENCADRANTS DU DÉPARTEMENT ══ */
app.get("/encadrants-departement/:etudiant_id", (req, res) => {
  const sql = `
    SELECT u.id, u.nom, u.prenom, e.grade, e.nb_etudiants_max, e.nb_etudiants_actuel
    FROM utilisateur u
    JOIN encadrant e ON u.id = e.utilisateur_id
    WHERE u.departement_id = (SELECT departement_id FROM utilisateur WHERE id = ?)
    AND u.est_actif = 1
    AND e.nb_etudiants_actuel < e.nb_etudiants_max
    ORDER BY u.nom ASC
  `;
  db.query(sql, [req.params.etudiant_id], (err, result) => {
    if (err) { console.log(err); return res.json({ success: false }); }
    res.json({ success: true, encadrants: result });
  });
});

/* ══ STAGE COMMUN ══ */
app.get("/stage-commun/:encadrant_id/:etudiant_id", (req, res) => {
  db.query("SELECT id AS stage_id FROM stage WHERE encadrant_id=? AND etudiant_id=? LIMIT 1",
    [req.params.encadrant_id, req.params.etudiant_id], (err, result) => {
      if (err || result.length === 0) return res.json({ success: false });
      res.json({ success: true, stage_id: result[0].stage_id });
    });
});

/* ══ MES ÉTUDIANTS (encadrant) ══ */
app.get("/mes-etudiants/:encadrant_id", (req, res) => {
  const sql = `
    SELECT u.id, u.nom, u.prenom, u.photo,
           s.id AS stage_id, s.titre, s.type_stage, s.statut,
           s.progression, s.entreprise, s.date_fin_prevue
    FROM stage s
    JOIN utilisateur u ON s.etudiant_id = u.id
    WHERE s.encadrant_id = ? AND s.statut != 'refuse'
    ORDER BY u.prenom ASC
  `;
  db.query(sql, [req.params.encadrant_id], (err, result) => {
    if (err) { console.log(err); return res.json({ success: false }); }
    res.json({ success: true, etudiants: result });
  });
});

/* ══ MES STAGES (étudiant) ══ */
app.get("/mes-stages/:etudiant_id", (req, res) => {
  db.query(
    "SELECT id, titre, entreprise, ville, type_stage, statut, progression, date_debut, date_fin_prevue, annee_univ FROM stage WHERE etudiant_id=? ORDER BY created_at DESC",
    [req.params.etudiant_id], (err, result) => {
      if (err) return res.json({ success: false });
      res.json({ success: true, stages: result });
    });
});

/* ══ STATUT STAGE ══ */
app.put("/stage/statut/:id", (req, res) => {
  const { statut } = req.body;
  db.query("UPDATE stage SET statut=? WHERE id=?", [statut, req.params.id], err => {
    if (err) return res.json({ success: false });
    db.query("SELECT etudiant_id FROM stage WHERE id=?", [req.params.id], (e, r) => {
      if (!e && r.length) {
        const msg = statut === "valide" ? "✅ Votre stage a été validé !" : "❌ Votre stage a été refusé.";
        db.query("INSERT INTO notification (message, type, user_id, stage_id) VALUES (?, 'statut', ?, ?)",
          [msg, r[0].etudiant_id, req.params.id], () => {});
      }
    });
    res.json({ success: true });
  });
});

/* ══ SUGGESTIONS ══ */
app.get("/suggestions/:etudiant_id", (req, res) => {
  const sql = `
    SELECT s.id, s.titre, s.description, s.technologies, s.type_stage, s.est_disponible,
           u.nom AS enc_nom, u.prenom AS enc_prenom, d.nom AS departement
    FROM suggestion s
    JOIN utilisateur u ON s.publie_par = u.id
    JOIN departement d ON s.departement_id = d.id
    WHERE s.type_stage = (SELECT type_stage FROM etudiant WHERE utilisateur_id = ?)
    AND s.departement_id = (SELECT departement_id FROM utilisateur WHERE id = ?)
    AND s.est_disponible = 1
    ORDER BY s.created_at DESC
  `;
  db.query(sql, [req.params.etudiant_id, req.params.etudiant_id], (err, result) => {
    if (err) { console.log(err); return res.json({ success: false }); }
    res.json({ success: true, suggestions: result });
  });
});

app.get("/mes-suggestions/:encadrant_id", (req, res) => {
  db.query("SELECT * FROM suggestion WHERE publie_par=? ORDER BY created_at DESC",
    [req.params.encadrant_id], (err, result) => {
      if (err) return res.json({ success: false });
      res.json({ success: true, suggestions: result });
    });
});

app.post("/suggestions", (req, res) => {
  const { titre, description, technologies, type_stage, publie_par } = req.body;
  if (!titre || !publie_par) return res.json({ success: false });
  db.query("SELECT departement_id FROM utilisateur WHERE id=?", [publie_par], (err, result) => {
    if (err || !result.length) return res.json({ success: false });
    db.query(
      "INSERT INTO suggestion (titre, description, technologies, type_stage, publie_par, departement_id, est_disponible) VALUES (?,?,?,?,?,?,1)",
      [titre, description||null, technologies||null, type_stage, publie_par, result[0].departement_id],
      (err2, r) => {
        if (err2) { console.log(err2); return res.json({ success: false }); }
        res.json({ success: true, id: r.insertId });
      }
    );
  });
});

/* ══ POSTULER ══ */
app.post("/postuler", (req, res) => {
  const { etudiant_id, suggestion_id } = req.body;
  if (!etudiant_id || !suggestion_id) return res.json({ success: false, message: "Paramètres manquants" });
  db.query("SELECT id FROM stage WHERE etudiant_id=? AND suggestion_id=?", [etudiant_id, suggestion_id], (err, existing) => {
    if (err) return res.json({ success: false });
    if (existing.length > 0) return res.json({ success: false, message: "Vous avez déjà postulé" });
    db.query("SELECT * FROM suggestion WHERE id=? AND est_disponible=1", [suggestion_id], (err2, suggs) => {
      if (err2 || !suggs.length) return res.json({ success: false, message: "Suggestion non disponible" });
      const sugg = suggs[0];
      db.query(
        "INSERT INTO stage (titre, description, type_stage, statut, annee_univ, etudiant_id, encadrant_id, suggestion_id) VALUES (?,?,?,'en_attente','2024-2025',?,?,?)",
        [sugg.titre, sugg.description, sugg.type_stage, etudiant_id, sugg.encadrant_id||null, suggestion_id],
        err3 => {
          if (err3) { console.log(err3); return res.json({ success: false }); }
          res.json({ success: true });
        }
      );
    });
  });
});

/* ══ DEMANDE STAGE ══ */
app.post("/demande-stage", (req, res) => {
  const { etudiant_id, encadrant_id, titre, description, technologies, type_stage, entreprise, ville, date_debut, date_fin } = req.body;
  if (!etudiant_id || !titre || !description)
    return res.json({ success: false, message: "Champs obligatoires manquants" });
  db.query("SELECT id FROM stage WHERE etudiant_id=? AND statut='en_attente'", [etudiant_id], (err, existing) => {
    if (err) return res.json({ success: false });
    if (existing.length > 0) return res.json({ success: false, message: "Vous avez déjà une demande en attente" });
    db.query(
      "INSERT INTO stage (titre, description, type_stage, statut, entreprise, ville, date_debut, date_fin_prevue, annee_univ, etudiant_id, encadrant_id) VALUES (?,?,?,'en_attente',?,?,?,?,'2024-2025',?,?)",
      [titre, description, type_stage||null, entreprise||null, ville||null, date_debut||null, date_fin||null, etudiant_id, encadrant_id||null],
      (err2, result) => {
        if (err2) { console.log(err2); return res.json({ success: false }); }
        if (encadrant_id) {
          db.query("INSERT INTO notification (message, type, user_id, stage_id) VALUES (?, 'affectation', ?, ?)",
            ["📋 Nouvelle demande de stage", encadrant_id, result.insertId], () => {});
          db.query("UPDATE encadrant SET nb_etudiants_actuel = nb_etudiants_actuel + 1 WHERE utilisateur_id=?",
            [encadrant_id], () => {});
        }
        res.json({ success: true, stage_id: result.insertId });
      }
    );
  });
});

/* ══ DEADLINES ══ */
app.get("/deadlines/:etudiant_id", (req, res) => {
  db.query(
    "SELECT d.titre, d.date_limit, d.description FROM deadline d WHERE d.type_stage = (SELECT type_stage FROM etudiant WHERE utilisateur_id = ?) ORDER BY d.date_limit ASC",
    [req.params.etudiant_id], (err, result) => {
      if (err) { console.log(err); return res.json({ success: false }); }
      res.json({ success: true, deadlines: result });
    });
});

/* ══ FEEDBACKS ══ */
app.get("/feedbacks/:stage_id", (req, res) => {
  db.query(
    "SELECT f.commentaire, f.created_at, u.nom AS enc_nom, u.prenom AS enc_prenom FROM feedback f JOIN utilisateur u ON f.encadrant_id = u.id WHERE f.stage_id = ? ORDER BY f.created_at DESC",
    [req.params.stage_id], (err, result) => {
      if (err) return res.json({ success: false });
      res.json({ success: true, feedbacks: result });
    });
});

app.post("/feedbacks", (req, res) => {
  const { commentaire, encadrant_id, stage_id, etudiant_id } = req.body;
  if (!commentaire) return res.json({ success: false });
  if (stage_id) {
    db.query("INSERT INTO feedback (commentaire, stage_id, encadrant_id) VALUES (?,?,?)",
      [commentaire, stage_id, encadrant_id], err => {
        if (err) { console.log(err); return res.json({ success: false }); }
        res.json({ success: true });
      });
  } else {
    db.query("SELECT id FROM stage WHERE etudiant_id=? AND encadrant_id=? AND statut!='refuse' LIMIT 1",
      [etudiant_id, encadrant_id], (err, result) => {
        if (err || !result.length) return res.json({ success: false });
        db.query("INSERT INTO feedback (commentaire, stage_id, encadrant_id) VALUES (?,?,?)",
          [commentaire, result[0].id, encadrant_id], err2 => {
            if (err2) return res.json({ success: false });
            res.json({ success: true });
          });
      });
  }
});

/* ══ RAPPORT ══ */
app.get("/rapport/:stage_id", (req, res) => {
  db.query("SELECT * FROM rapport WHERE stage_id=? LIMIT 1", [req.params.stage_id], (err, result) => {
    if (err || !result.length) return res.json({ success: false });
    res.json({ success: true, rapport: result[0] });
  });
});

app.post("/deposer-rapport", uploadRapport.single("rapport"), (req, res) => {
  if (!req.file) return res.json({ success: false });
  const { stage_id, nom_fichier, taille } = req.body;
  db.query("SELECT id FROM rapport WHERE stage_id=?", [stage_id], (err, existing) => {
    if (err) return res.json({ success: false });
    if (existing.length > 0) {
      db.query("UPDATE rapport SET chemin_fichier=?, nom_fichier=?, taille=?, date_depot=NOW(), est_valide=0 WHERE stage_id=?",
        [req.file.filename, nom_fichier, taille, stage_id], err2 => {
          if (err2) return res.json({ success: false });
          db.query("UPDATE stage SET statut='rapport_depose' WHERE id=?", [stage_id]);
          res.json({ success: true });
        });
    } else {
      db.query("INSERT INTO rapport (stage_id, chemin_fichier, nom_fichier, taille) VALUES (?,?,?,?)",
        [stage_id, req.file.filename, nom_fichier, taille], err2 => {
          if (err2) { console.log(err2); return res.json({ success: false }); }
          db.query("UPDATE stage SET statut='rapport_depose' WHERE id=?", [stage_id]);
          res.json({ success: true });
        });
    }
  });
});

app.put("/rapports/:id/valider", (req, res) => {
  db.query("UPDATE rapport SET est_valide=1, date_validation=NOW() WHERE id=?", [req.params.id],
    err => { if (err) return res.json({ success: false }); res.json({ success: true }); });
});

app.put("/rapports/:id/refuser", (req, res) => {
  db.query("UPDATE rapport SET est_valide=0 WHERE id=?", [req.params.id],
    err => { if (err) return res.json({ success: false }); res.json({ success: true }); });
});

/* ══ MESSAGES ══ */
app.post("/send-message", (req, res) => {
  const { contenu, expediteur_id, destinataire_id, stage_id } = req.body;
  if (!contenu || !expediteur_id || !destinataire_id)
    return res.json({ success: false, message: "Paramètres manquants" });

  const insertMsg = (sid) => {
    db.query(
      "INSERT INTO message (contenu, type, expediteur_id, destinataire_id, stage_id) VALUES (?, 'text', ?, ?, ?)",
      [contenu, parseInt(expediteur_id), parseInt(destinataire_id), sid || null],
      err => {
        if (err) { console.log(err); return res.json({ success: false }); }
        res.json({ success: true });
      }
    );
  };

  if (stage_id && !isNaN(parseInt(stage_id))) {
    insertMsg(parseInt(stage_id));
  } else {
    db.query(
      "SELECT id FROM stage WHERE ((etudiant_id=? AND encadrant_id=?) OR (etudiant_id=? AND encadrant_id=?)) AND statut!='refuse' LIMIT 1",
      [expediteur_id, destinataire_id, destinataire_id, expediteur_id],
      (err, result) => insertMsg(result?.[0]?.id || null)
    );
  }
});

app.post("/send-audio", uploadAudio.single("audio"), (req, res) => {
  if (!req.file) return res.json({ success: false });
  const { expediteur_id, destinataire_id, stage_id } = req.body;
  if (!expediteur_id || !destinataire_id) return res.json({ success: false });
  db.query(
    "INSERT INTO message (contenu, type, expediteur_id, destinataire_id, stage_id) VALUES (?, 'audio', ?, ?, ?)",
    ["audio/" + req.file.filename, parseInt(expediteur_id), parseInt(destinataire_id), stage_id ? parseInt(stage_id) : null],
    err => {
      if (err) { console.log(err); return res.json({ success: false }); }
      res.json({ success: true, filename: req.file.filename });
    }
  );
});

app.post("/send-file", uploadFile.single("file"), (req, res) => {
  if (!req.file) return res.json({ success: false });
  const { expediteur_id, destinataire_id, stage_id } = req.body;
  if (!expediteur_id || !destinataire_id) return res.json({ success: false });
  db.query(
    "INSERT INTO message (contenu, type, expediteur_id, destinataire_id, stage_id) VALUES (?, 'fichier', ?, ?, ?)",
    [req.file.filename, parseInt(expediteur_id), parseInt(destinataire_id), stage_id ? parseInt(stage_id) : null],
    err => {
      if (err) { console.log(err); return res.json({ success: false }); }
      res.json({ success: true, filename: req.file.filename });
    }
  );
});

app.get("/messages/:id1/:id2", (req, res) => {
  db.query(
    "SELECT * FROM message WHERE (expediteur_id=? AND destinataire_id=?) OR (expediteur_id=? AND destinataire_id=?) ORDER BY date_envoi ASC",
    [req.params.id1, req.params.id2, req.params.id2, req.params.id1],
    (err, result) => {
      if (err) return res.json([]);
      res.json(result);
    });
});

app.put("/mark-read/:user_id/:from_id", (req, res) => {
  db.query("UPDATE message SET est_lu=1 WHERE destinataire_id=? AND expediteur_id=?",
    [req.params.user_id, req.params.from_id],
    err => { if (err) return res.json({ success: false }); res.json({ success: true }); });
});

app.delete("/delete-message/:id", (req, res) => {
  db.query("DELETE FROM message WHERE id=?", [req.params.id], () => res.json({ success: true }));
});

app.put("/update-message/:id", (req, res) => {
  db.query("UPDATE message SET contenu=? WHERE id=?", [req.body.contenu, req.params.id],
    () => res.json({ success: true }));
});

/* ══ NOTIFICATIONS ══ */
app.get("/notifications/:user_id", (req, res) => {
  db.query("SELECT * FROM notification WHERE user_id=? ORDER BY date_creation DESC",
    [req.params.user_id], (err, result) => {
      if (err) return res.json({ success: false });
      res.json({ success: true, notifications: result });
    });
});

app.put("/notifications/read/:id", (req, res) => {
  db.query("UPDATE notification SET est_lue=1 WHERE id=?", [req.params.id],
    err => { if (err) return res.json({ success: false }); res.json({ success: true }); });
});

app.put("/notifications/read-all/:user_id", (req, res) => {
  db.query("UPDATE notification SET est_lue=1 WHERE user_id=?", [req.params.user_id],
    err => { if (err) return res.json({ success: false }); res.json({ success: true }); });
});

/* ══ JOURNAL ══ */
app.post("/journal", (req, res) => {
  const { etudiant_id, titre, contenu, date, tags, mood, progression } = req.body;
  if (!etudiant_id || !titre || !contenu) return res.json({ success: false, message: "Champs obligatoires" });
  db.query(
    "INSERT INTO journal (etudiant_id, titre, contenu, date, tags, mood, progression) VALUES (?,?,?,?,?,?,?)",
    [etudiant_id, titre, contenu, date, tags||null, mood||null, progression||0],
    (err, result) => {
      if (err) { console.log(err); return res.json({ success: false }); }
      res.json({ success: true, id: result.insertId });
    }
  );
});

app.get("/journal/:etudiant_id", (req, res) => {
  db.query("SELECT * FROM journal WHERE etudiant_id=? ORDER BY date DESC, created_at DESC",
    [req.params.etudiant_id], (err, result) => {
      if (err) return res.json({ success: false });
      res.json({ success: true, entries: result });
    });
});

app.get("/journal-entry/:id", (req, res) => {
  db.query("SELECT * FROM journal WHERE id=?", [req.params.id], (err, result) => {
    if (err || !result.length) return res.json({ success: false });
    res.json({ success: true, entry: result[0] });
  });
});

app.delete("/journal/:id", (req, res) => {
  db.query("DELETE FROM journal WHERE id=?", [req.params.id], () => res.json({ success: true }));
});

app.put("/journal/feedback/:id", (req, res) => {
  db.query("UPDATE journal SET feedback=?, feedback_date=NOW() WHERE id=?",
    [req.body.feedback, req.params.id], err => {
      if (err) return res.json({ success: false });
      res.json({ success: true });
    });
});

/* ══ CERTIFICAT ══ */
app.post("/generate-certificate/:stage_id", (req, res) => {
  db.query("SELECT * FROM stage WHERE id=? AND statut='valide'", [req.params.stage_id], (err, result) => {
    if (err || !result.length) return res.json({ success: false, message: "Stage non validé" });
    const token = crypto.randomBytes(32).toString("hex");
    db.query("UPDATE stage SET verify_token=?, token_created_at=NOW() WHERE id=?",
      [token, req.params.stage_id], err2 => {
        if (err2) return res.json({ success: false });
        res.json({ success: true, token });
      });
  });
});

app.get("/verify/:token", (req, res) => {
  db.query(
    `SELECT s.titre, s.type_stage, s.date_debut, s.date_fin_prevue, s.entreprise, s.ville, s.statut, s.token_created_at,
     u.nom AS etu_nom, u.prenom AS etu_prenom,
     enc.nom AS enc_nom, enc.prenom AS enc_prenom
     FROM stage s
     JOIN utilisateur u ON s.etudiant_id = u.id
     LEFT JOIN utilisateur enc ON s.encadrant_id = enc.id
     WHERE s.verify_token = ? AND s.statut = 'valide'`,
    [req.params.token], (err, result) => {
      if (err || !result.length) return res.json({ success: false, message: "Certificat invalide" });
      res.json({ success: true, stage: result[0] });
    });
});

/* ══ RESSOURCES ══ */
app.get("/ressources/:dept_id", (req, res) => {
  db.query(
    "SELECT r.*, u.nom AS chef_nom, u.prenom AS chef_prenom FROM ressource r JOIN utilisateur u ON r.chef_id = u.id WHERE r.departement_id = ? ORDER BY r.created_at DESC",
    [req.params.dept_id], (err, result) => {
      if (err) return res.json({ success: false });
      res.json({ success: true, ressources: result });
    });
});

app.post("/ressources", uploadRessource.single("fichier"), (req, res) => {
  if (!req.file) return res.json({ success: false, message: "Fichier manquant" });
  const { titre, description, type, chef_id } = req.body;
  db.query("SELECT departement_id FROM utilisateur WHERE id=?", [chef_id], (err, result) => {
    if (err || !result.length) return res.json({ success: false });
    db.query(
      "INSERT INTO ressource (titre, description, type, filename, departement_id, chef_id, taille) VALUES (?,?,?,?,?,?,?)",
      [titre, description||null, type||"autre", req.file.filename, result[0].departement_id, chef_id, req.file.size],
      err2 => {
        if (err2) { console.log(err2); return res.json({ success: false }); }
        res.json({ success: true });
      }
    );
  });
});

/* ══ STAGES VALIDÉS ══ */
app.get("/stages-valides", (req, res) => {
  db.query(
    "SELECT s.id, s.titre, s.type_stage, s.entreprise, s.ville, u.nom AS etu_nom, u.prenom AS etu_prenom FROM stage s JOIN utilisateur u ON s.etudiant_id = u.id WHERE s.statut = 'valide' AND s.entreprise IS NOT NULL ORDER BY s.created_at DESC",
    (err, result) => {
      if (err) return res.json({ success: false });
      res.json({ success: true, stages: result });
    });
});

/* ══ RENDEZ-VOUS ══ */
app.post("/rdv", (req, res) => {
  const { encadrant_id, date_rdv, heure_debut, heure_fin } = req.body;
  if (!encadrant_id || !date_rdv || !heure_debut || !heure_fin)
    return res.json({ success: false, message: "Champs obligatoires" });
  db.query(
    "INSERT INTO rendez_vous (encadrant_id, date_rdv, heure_debut, heure_fin, statut) VALUES (?,?,?,?,'disponible')",
    [encadrant_id, date_rdv, heure_debut, heure_fin],
    (err, result) => {
      if (err) { console.log(err); return res.json({ success: false }); }
      res.json({ success: true, id: result.insertId });
    }
  );
});

app.get("/rdv/disponibles/:encadrant_id", (req, res) => {
  db.query(
    "SELECT * FROM rendez_vous WHERE encadrant_id=? AND statut='disponible' AND date_rdv >= CURDATE() ORDER BY date_rdv ASC, heure_debut ASC",
    [req.params.encadrant_id], (err, result) => {
      if (err) return res.json({ success: false });
      res.json({ success: true, rdvs: result });
    }
  );
});
/* ══ CHECK EMAIL ══ */
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  // Check only — بدون password
  if (password === "__CHECK_ONLY__") {
    db.query(
      "SELECT nom, prenom, role FROM utilisateur WHERE email=? AND est_actif=1",
      [email], (err, result) => {
        if (err || !result.length)
          return res.json({ success: false, email_exists: false });
        res.json({
          success: false,
          email_exists: true,
          nom:    result[0].nom,
          prenom: result[0].prenom,
          role:   result[0].role
        });
      }
    );
    return;
  }

  // Login normal
  db.query("SELECT * FROM utilisateur WHERE email=? AND password=?",
    [email, password], (err, result) => {
      if (err) return res.json({ success: false, message: "Erreur serveur" });
      if (result.length > 0) res.json({ success: true, user: result[0] });
      else res.json({ success: false, message: "Email ou mot de passe incorrect" });
    });
});
app.put("/rdv/reserver/:id", (req, res) => {
  const { etudiant_id, sujet, note_etudiant } = req.body;
  db.query(
    "UPDATE rendez_vous SET etudiant_id=?, statut='reserve', sujet=?, note_etudiant=? WHERE id=? AND statut='disponible'",
    [etudiant_id, sujet||null, note_etudiant||null, req.params.id],
    (err, result) => {
      if (err || result.affectedRows === 0) return res.json({ success: false, message: "Créneau non disponible" });
      db.query("SELECT encadrant_id FROM rendez_vous WHERE id=?", [req.params.id], (e, r) => {
        if (!e && r.length) {
          db.query("INSERT INTO notification (message, type, user_id) VALUES (?, 'statut', ?)",
            ["📅 Nouvelle demande de rendez-vous", r[0].encadrant_id], () => {});
        }
      });
      res.json({ success: true });
    }
  );
});

app.put("/rdv/statut/:id", (req, res) => {
  const { statut, note_encadrant } = req.body;
  db.query("UPDATE rendez_vous SET statut=?, note_encadrant=? WHERE id=?",
    [statut, note_encadrant||null, req.params.id], err => {
      if (err) return res.json({ success: false });
      db.query("SELECT etudiant_id FROM rendez_vous WHERE id=?", [req.params.id], (e, r) => {
        if (!e && r.length && r[0].etudiant_id) {
          const msg = statut === "confirme" ? "✅ Votre rendez-vous a été confirmé !" : "❌ Votre rendez-vous a été refusé.";
          db.query("INSERT INTO notification (message, type, user_id) VALUES (?, 'statut', ?)",
            [msg, r[0].etudiant_id], () => {});
        }
      });
      res.json({ success: true });
    }
  );
});

app.get("/rdv/mes/:user_id", (req, res) => {
  db.query(
    `SELECT r.*, etu.nom AS etu_nom, etu.prenom AS etu_prenom, enc.nom AS enc_nom, enc.prenom AS enc_prenom
     FROM rendez_vous r
     LEFT JOIN utilisateur etu ON r.etudiant_id = etu.id
     LEFT JOIN utilisateur enc ON r.encadrant_id = enc.id
     WHERE r.etudiant_id=? OR r.encadrant_id=?
     ORDER BY r.date_rdv DESC, r.heure_debut DESC`,
    [req.params.user_id, req.params.user_id],
    (err, result) => {
      if (err) return res.json({ success: false });
      res.json({ success: true, rdvs: result });
    }
  );
});

app.put("/rdv/annuler/:id", (req, res) => {
  db.query(
    "UPDATE rendez_vous SET statut='disponible', etudiant_id=NULL, sujet=NULL, note_etudiant=NULL WHERE id=?",
    [req.params.id], err => {
      if (err) return res.json({ success: false });
      res.json({ success: true });
    }
  );
});

/* ══ CHATBOT GROQ ══ */
app.post("/chatbot", (req, res) => {
  const { messages, system } = req.body;
  const data = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: system || "Tu es un assistant expert en gestion de stages universitaires en Tunisie." },
      ...messages
    ],
    max_tokens: 1000
  });

  const options = {
    hostname: "api.groq.com",
    path:     "/openai/v1/chat/completions",
    method:   "POST",
    headers: {
      "Content-Type":   "application/json",
     "Authorization": "Bearer " + process.env.GROQ_API_KEY,
      "Content-Length": Buffer.byteLength(data)
    }
  };

  const apiReq = https.request(options, apiRes => {
    let body = "";
    apiRes.on("data", chunk => body += chunk);
    apiRes.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const text   = parsed.choices?.[0]?.message?.content || "Désolé, réessayez.";
        res.json({ success: true, content: [{ text }] });
      } catch(e) {
        res.json({ success: false, content: [{ text: "Erreur de réponse IA" }] });
      }
    });
  });

  apiReq.on("error", err => {
    console.log("Groq error:", err.message);
    res.json({ success: false, content: [{ text: "Service IA temporairement indisponible" }] });
  });

  apiReq.write(data);
  apiReq.end();
});

/* ══ SERVER ══ */
app.listen(3000, () => console.log("✅ Serveur lancé sur http://localhost:3000"));