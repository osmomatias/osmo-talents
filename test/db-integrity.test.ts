import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "osmo-test-"));
process.env.DB_PATH = path.join(dir, "test.sqlite");
const { db, run } = require("../src/db") as typeof import("../src/db");

test("schema rejects invalid workflow states", () => {
  run("INSERT INTO users (name,email,pass_hash,role) VALUES ('Cliente','c@example.test','x','cliente')");
  run("INSERT INTO users (name,email,pass_hash,role) VALUES ('Freela','f@example.test','x','freela')");
  run("INSERT INTO jobs (client_id,title,cat,status) VALUES (1,'Projeto válido','design','aberta')");
  run("INSERT INTO proposals (job_id,freela_id,text,value,days,status) VALUES (1,2,'Proposta',100,5,'enviada')");
  run("INSERT INTO contracts (job_id,proposal_id,client_id,freela_id,value) VALUES (1,1,1,2,100)");
  run("INSERT INTO milestones (contract_id,pos,title,value) VALUES (1,0,'Etapa válida',100)");

  assert.throws(() => run("UPDATE jobs SET status = 'inventado' WHERE id = 1"), /invalid job status/);
  assert.throws(() => run("UPDATE proposals SET status = 'inventado' WHERE id = 1"), /invalid proposal status/);
  assert.throws(() => run("INSERT INTO milestones (contract_id,pos,title,value,status) VALUES (1,0,'Etapa',100,'inventado')"), /invalid milestone status/);
  assert.throws(() => run("UPDATE milestones SET pay_status = 'inventado' WHERE id = 1"), /invalid milestone payment status/);
});

test("contracts and reviews must use the actual job and contract participants", () => {
  assert.throws(() => run("INSERT INTO contracts (job_id,proposal_id,client_id,freela_id,value) VALUES (1,1,2,1,100)"), /contract parties do not match/);
  run("INSERT INTO reviews (contract_id,author_id,target_id,rating) VALUES (1,1,2,5)");
  assert.throws(() => run("INSERT INTO reviews (contract_id,author_id,target_id,rating) VALUES (1,1,1,5)"), /review parties do not match/);
  assert.throws(() => run("UPDATE reviews SET target_id = 1 WHERE id = 1"), /review parties do not match/);
});

test.after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
