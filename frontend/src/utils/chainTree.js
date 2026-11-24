/** Turn the API's ordered rows (id + depth) into a nested tree. */
export default function buildTree(rows) {
  const roots = [];
  const stack = [];
  rows.forEach((row) => {
    const node = { id: row.id, key: row.path.join('-'), children: [] };
    while (stack.length > row.depth) stack.pop();
    (stack.length ? stack[stack.length - 1].children : roots).push(node);
    stack.push(node);
  });
  return roots;
}
