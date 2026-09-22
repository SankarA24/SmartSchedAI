import jwt from "jsonwebtoken";

// =====================================================
// requireAuth
// Reads "Authorization: Bearer <token>", verifies it with
// JWT_SECRET and attaches the decoded payload to req.user.
// Responds 401 when the token is missing or invalid.
// =====================================================

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }
}

// =====================================================
// requireRole(...roles)
// Must run after requireAuth. Responds 403 when the
// authenticated user's role is not in the allowed list.
// =====================================================

export function requireRole(...roles) {
  const allowed = roles.map((r) => String(r).toLowerCase());

  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();

    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    if (!allowed.includes(role)) {
      return res.status(403).json({
        error: "You do not have permission to perform this action",
      });
    }

    return next();
  };
}
