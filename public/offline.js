// Página "sem internet": o botão tenta de novo, e quando a conexão volta sozinha a página recarrega.
document.getElementById("retry").addEventListener("click", () => location.reload());
addEventListener("online", () => location.reload());
