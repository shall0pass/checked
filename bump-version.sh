#!/usr/bin/env bash
# bump-version.sh: Automate version bump for all package.json files
# Usage: ./bump-version.sh <new_version>

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <new_version>"
  exit 1
fi

NEW_VERSION="$1"

# Update version in all package.json files
for file in package.json server/package.json web/package.json; do
  if [ -f "$file" ]; then
    echo "Bumping $file to version $NEW_VERSION"
    # Use jq if available, else fallback to sed
    if command -v jq > /dev/null; then
      tmp=$(mktemp)
      jq --arg v "$NEW_VERSION" '.version = $v' "$file" > "$tmp" && mv "$tmp" "$file"
    else
      sed -i.bak -E "s/(\"version\": )\"[^"]+\"/\1\"$NEW_VERSION\"/" "$file"
      rm "$file.bak"
    fi
  fi
done

git add package.json server/package.json web/package.json
git commit -m "chore: version bump to v$NEW_VERSION"
echo "Version bumped to $NEW_VERSION and committed."
