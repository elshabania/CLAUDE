import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="state">
      This page does not exist. <Link to="/">Back to the run overview</Link>.
    </div>
  );
}
